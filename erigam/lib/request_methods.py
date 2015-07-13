import os
from functools import wraps
from flask import g, request, abort
from redis import ConnectionPool, Redis

from erigam.lib import validate_chat_url, session_validator
from erigam.lib.characters import CHARACTER_DETAILS
from erigam.lib.model import sm
from erigam.lib.sessions import Session

# Connection pooling. This takes far too much effort.
redis_pool = ConnectionPool(host=os.environ['REDIS_HOST'], port=int(os.environ['REDIS_PORT']), db=int(os.environ['REDIS_DB']))

# Application start

def populate_all_chars():
    redis = Redis(host=os.environ['REDIS_HOST'], port=int(os.environ['REDIS_PORT']), db=int(os.environ['REDIS_DB']))
    pipe = redis.pipeline()
    pipe.delete('all-chars')
    pipe.sadd('all-chars', *CHARACTER_DETAILS.keys())
    pipe.execute()
    del pipe
    del redis

# SQL functions

def use_db(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Create DB object if it does not exist.
        if not hasattr(g, "mysql"):
            g.mysql = sm()

        return f(*args, **kwargs)
    return decorated_function

# Before request

def connect_db():
    # Connect to Redis
    g.redis = Redis(connection_pool=redis_pool)

    # Connect to SQL
    g.mysql = sm()

def create_session():
    # Do not bother allowing the user in if they are globalbanned.
    if g.redis.sismember("globalbans", request.headers.get('X-Forwarded-For', request.remote_addr)):
        abort(403)

    # Create a user object, using session ID.

    session_id = request.cookies.get('session', None)
    chat = request.form.get('chat', None)

    if chat and validate_chat_url(chat):
        if session_id is None or session_validator.match(session_id) is None:
            abort(400)

        # Put the chat type into the global scope for the request.
        g.chat_type = g.redis.hget('chat.'+chat+'.meta', 'type')

        # Abort 404 if there's no type because the chat might not be real.
        if g.chat_type is None:
            abort(404)

        g.user = Session(g.redis, session_id, chat)
    else:
        session_id = request.cookies.get('session', None)
        g.user = Session(g.redis, session_id)

    # Log their IP address.
    g.redis.hset('session.'+g.user.session_id+'.meta', 'last_ip', g.user.ip)


# After request

def set_cookie(response):
    try:
        response.set_cookie('session', g.user.session_id, max_age=365*24*60*60, domain="." + os.environ.get("BASE_DOMAIN", "terminallycapricio.us"))
        response.set_cookie('session', g.user.session_id, max_age=365*24*60*60)
    except AttributeError:
        # That isn't gonna work if we don't have a user object, just ignore it.
        pass
    return response

def disconnect_db(response=None):
    # Close and delete Redis PubSubs
    if hasattr(g, "pubsub"):
        g.pubsub.close()
        del g.pubsub

    # Delete Redis object
    del g.redis

    # Close SQL
    if hasattr(g, "mysql"):
        g.mysql.close()
        del g.mysql

    return response