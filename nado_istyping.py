import tornado.httpserver
import tornado.websocket
import tornado.ioloop
import tornado.web
from tornado.gen import engine, Task
import ujson as json
from tornadoredis import Client
import redis
import re

print "WS Server started!"

session_validator = re.compile('^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
r = redis.Redis()
wsclients = set()

class WSHandler(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin):
        return True

    def open(self, chat):
        self.chat = chat
        self.redis_listen("chat:"+str(self.chat))
        self.remote_ip = self.request.headers.get('X-Forwarded-For', self.request.headers.get('X-Real-Ip', self.request.remote_ip))
        self.session = self.get_cookie("session", None)
        wsclients.add(self)

    def on_message(self, msg):
        if self.session is None or session_validator.match(self.session) is None:
            return

        message = json.loads(msg)
        if message["a"] in ("typing", "stopped_typing") and 'c' in message:
            try:
                counter = int(message['c'])
                if self.remote_ip != r.hget("session.%s.meta" % (self.session), "last_ip"):
                    return
            except TypeError:
                return
            r.publish("chat:"+str(self.chat), json.dumps({
                "a": message["a"],  # action
                "c": counter  # counter
            }))

    def on_close(self):
        self.redis_client.unsubscribe("chat:"+str(self.chat))
        wsclients.discard(self)

    @engine
    def redis_listen(self, channel):
        self.redis_client = Client()
        yield Task(self.redis_client.subscribe, channel)
        self.redis_client.listen(self.on_redis_message, self.on_redis_unsubscribe)

    def on_redis_message(self, message):
        if message.kind == "message":
            self.write_message(message.body)

    def on_redis_unsubscribe(self, callback):
        self.redis_client.disconnect()

settings = dict(
    debug=True,
    gzip=True,
)

application = tornado.web.Application([
    (r'/([^/]+)', WSHandler),
], **settings)


if __name__ == "__main__":
    application.autoreload = True
    http_server = tornado.httpserver.HTTPServer(application)
    http_server.listen(8081)
    tornado.ioloop.IOLoop.instance().start()
