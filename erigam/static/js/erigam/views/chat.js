define("erigam/views/chat", [
		'jquery',
		'erigam/helpers',
		'erigam/quirks',
		'erigam/bbcode',
		'erigam/characters',
		'erigam/tts'
	], function(
		$,
		helpers,
		quirks,
		bbcode) {
	"use strict";

	var user, chat, chat_meta, latestNum, log_id;

	var SEARCH_PERIOD = 1;
	var PING_PERIOD = 10;

	var SEARCH_URL = "/search";
	var SEARCH_QUIT_URL = "/stop_search";
	var POST_URL = "/chat_ajax/post";
	var FLAG_URL = "/chat_ajax/flag";
	var PING_URL = "/chat_ajax/ping";
	var MESSAGES_URL = "/chat_ajax/messages";
	var SAVE_URL = "/chat_ajax/save";
	var QUIT_URL = "/chat_ajax/quit";
	var STATE_URL = "/chat_ajax/state";

	var CHAT_FLAGS = ['autosilence', 'public', 'nsfw'];

	var MOD_GROUPS = ['globalmod', 'mod', 'mod2', 'mod3'];
	var GROUP_RANKS = { 'globalmod': 6, 'mod': 5, 'mod2': 4, 'mod3': 3, 'user': 2, 'silent': 1 };
	var GROUP_DESCRIPTIONS = {
		'globalmod': { title: 'God tier moderator', description: 'RP.TC staff.', shorthand: 'Staff' },
		'mod': { title: 'Professional Wet Blanket', description: 'can silence, kick and ban other users.', shorthand: 'Wet Blanket' },
		'mod2': { title: 'Bum\'s Rusher', description: 'can silence and kick other users.', shorthand: 'Bum Rusher' },
		'mod3': { title: 'Amateur Gavel-Slinger', description: 'can silence other users.', shorthand: 'Gavel Slinger' },
		'user': { title: '', description: '', shorthand: 'User' },
		'silent': { title: 'Silenced', description: '', shorthand: 'Silent' },
	};

	var pingInterval;
	var chatState;
	var userState = 'online';
	var newState;
	var currentSidebar;
	var previewHidden = false;

	var actionListUser = null;
	var highlightUser;

	var ORIGINAL_TITLE = document.title;
	var conversation = $('#conversation');

	// Settings
	var sysnot = 0;
	var audioset, bgset, highlightall = 0;
	var bbcodeon = 1;
	var audio, background;

	function load_settings() {
		if (helpers.check_localstorage()) {
			$(".stoptions").show();

			if (!localStorage.getItem(chat+"sysnot")) {
				localStorage.setItem(chat+"sysnot", sysnot);
			}

			if (!localStorage.getItem(chat+"bbcodeon")) {
				localStorage.setItem(chat+"bbcodeon", bbcodeon);
			}

			if (!localStorage.getItem(chat+"audioset")) {
				localStorage.setItem(chat+"audioset", audioset);
			}

			if (!localStorage.getItem(chat+"bgset")) {
				localStorage.setItem(chat+"bgset", bgset);
			}

			sysnot = localStorage.getItem(chat+"sysnot");
			bbcodeon = localStorage.getItem(chat+"bbcodeon");
			audioset = localStorage.getItem(chat+"audioset");
			bgset = localStorage.getItem(chat+"bgset");
		} else {
			$('.system').show();
			$('.globalann').show();
		}

		if (sysnot == 1) {
			$('.sysnot').attr('checked','checked');
			$('.system').hide();
			$('.globalann').hide();
		}

		if (bbcodeon == 1) {
			$('.bbcodeon').attr('checked','checked');
		} else {
			$('.bbcodeon').removeAttr('checked');
		}

		if (audioset == 1) {
			$('.audioset').attr('checked','checked');
		} else {
			$('.audioset').removeAttr('checked');
		}

		if (bgset == 1) {
			$('.bgset').attr('checked','checked');
		} else {
			$('.bgset').removeAttr('checked');
		}

		if (highlightall == 1) {
			$('.highlightall').attr('checked','checked');
		} else {
			$('.highlightall').removeAttr('checked');
		}

		// Toggles
		$('.sysnot').click(function() {
			if (this.checked) {
				if (helpers.check_localstorage()) {
					localStorage.setItem(chat+"sysnot",1);
				}
				sysnot = 1;
				$('.system').hide();
				$('.globalann').hide();
			} else {
				if (helpers.check_localstorage()) {
					localStorage.setItem(chat+"sysnot",0);
				}
				sysnot = 0;
				$('.system').show();
				$('.globalann').show();
				conversation.scrollTop(conversation[0].scrollHeight);
			}
		});

		$('.bbcodeon').click(function() {
			if (this.checked) {
				if (helpers.check_localstorage()) {
					localStorage.setItem(chat+"bbcodeon",1);
				}
				bbcodeon = 1;
			} else {
				if (helpers.check_localstorage()) {
					localStorage.setItem(chat+"bbcodeon",0);
				}
				bbcodeon = 0;
			}
		});

		$('.audioset').click(function() {
			if (this.checked) {
				if (helpers.check_localstorage()) {
					localStorage.setItem(chat+"audioset",1);
				}
				audioset = 1;
				$("#backgroundAudio").attr('src', audio);
			} else {
				if (helpers.check_localstorage()) {
					localStorage.setItem(chat+"audioset",0);
				}
				audioset = 0;
				$("#backgroundAudio").attr('src', '');
			}
		});

		$('.bgset').click(function() {
			if (this.checked) {
				if (helpers.check_localstorage()) localStorage.setItem(chat+"bgset", 1);
				bgset = 1;
				update_meta();
			} else {
				if (helpers.check_localstorage()) localStorage.setItem(chat+"bgset",0);
				bgset = 0;
				update_meta();
			}
		});
	

		$('#conversation p').each(function() {
			var line;
			if (bbcodeon == 1) {
				line = bbcode.raw_encode($(this).html());
				$(this).html(line);
			} else {
				line = bbcode.remove($(this).html());
				$(this).html(line);
			}
		});

		if ($('#topic').length !== 0) {
			var text;

			if (bbcodeon == 1) {
				text = bbcode.encode($('#topic').html());
				$('#topic').html(text);
			} else {
				text = bbcode.remove($('#topic').html());
				$('#topic').html(text);
			}
		}
	}

	function update_meta() {
		if (bgset == 1 && background) {
			$("#conversation, #userList, #settings").css("background-color", "rgba(238, 238, 238, 0.5)");
			$("body").css('background-image', 'url("' + background + '")' );
		} else {
			$("#conversation, #userList, #settings").css("background-color", "rgb(238, 238, 238)");
			$("body").css('background-image', 'none');
		}

		if (audioset == 1 && audio) {
			// Only update the element if the URL has changed, otherwise it restarts it.
			if (audio != $("#backgroundAudio").attr('src')) {
				$("#backgroundAudio").attr('src', audio);
			}
			if (helpers.get_hidden()) {
				$("#backgroundAudio")[0].pause();
			}
		} else {
			$("#backgroundAudio").attr('src', '');
		}
	}

	// Search

	var searching;

	function runSearch() {
		document.title = 'Searching - '+ORIGINAL_TITLE;
		conversation.addClass('search');
		searching = true;

		$.post(SEARCH_URL, {}, function(data) {
			chat = data.chat;
			log_id = data.log;
			searching = false;
			if (typeof window.history.replaceState != "undefined") {
				window.history.replaceState('', '', '/chat/'+chat);
				startChat();
			} else {
				window.location.replace(chaturl);
			}
		}).always(function() {
			if (searching === true) {
				window.setTimeout(runSearch, 1000);
			} else {
				conversation.removeClass('search');
			}
		});
	}

	function startChat() {
		chatState = 'chat';
		document.title = 'Chat - '+ORIGINAL_TITLE;
		$('#preview').css('color', '#'+user.character.color);
		closeSettings();
		getMessages(true);
		load_settings();
		pingInterval = window.setTimeout(pingServer, PING_PERIOD*1000);
		scroll_to_bottom();
	}

	function is_at_bottom() {
		var current_scroll = conversation.scrollTop() + conversation.height();
		var max_scroll = conversation[0].scrollHeight;
		return max_scroll - current_scroll < 30;
	}

	function scroll_to_bottom() {
		conversation.scrollTop(conversation[0].scrollHeight);
	}

	function addLine(msg) {
		var msgClass;
		var message;
		var at_bottom = is_at_bottom();
		var globalmod = (
			(user_data && user_data[msg.counter] && user_data[msg.counter].meta.group == "globalmod") ||
			msg.counter == -2
		);

		if (msg.counter == -1) {
			msgClass = 'system';
		} else {
			msgClass = 'user'+msg.counter;
		}

		if (msg.acronym) msg.text = msg.acronym + ": " + msg.text;

		if (bbcodeon == 1 || globalmod) {
			message = bbcode.encode(msg.text, globalmod);
		} else {
			message = bbcode.remove(msg.text);
		}

		var mp = $('<p>').addClass(msgClass).addClass("message").attr('title', msgClass).css('color', '#'+msg.color).html(message); //.appendTo('#conversation');

		// Timestamp
		var date = new Date(msg.timestamp * 1000)
		$("<span>").addClass("timestamp").text(date.toLocaleTimeString()).appendTo(mp);

		// Highlighting
		if (highlightUser == msg.counter) mp.addClass('highlight');

		// Hide system
		if (sysnot == 1 && msgClass == 'system') $('.system').hide();

		mp.appendTo('#conversation');

		if (at_bottom) scroll_to_bottom();

		return mp;
	}

	function handleMessages(data) {
		if (typeof data.exit!=='undefined') {
			if (data.exit=='kick') {
				clearChat();
				addLine({ counter: -1, color: '000000', text: 'You have been kicked from this chat. Please think long and hard about your behaviour before rejoining.' });
				scroll_to_bottom();
			} else if (data.exit=='ban') {
				window.location.replace(document.location.origin + "/chat/theoubliette");
			}
			return true;
		}

		// Messagse
		if (typeof data.messages !== "undefined") {
			for (var i=0; i<data.messages.length; i++) {
				addLine(data.messages[i]);
				latestNum = Math.max(latestNum, data.messages[i].id);
			}

			if (data.messages.length>0 && helpers.get_hidden() === true) {
				document.title = "New message - "+ORIGINAL_TITLE;
			}
		}

		if (typeof data.counter!=="undefined") {
			user.meta.counter = data.counter;
		}

		if (typeof data.highlight !== "undefined") {
			highlightPosts(data.highlight);
		}

		if (typeof data.online !== "undefined") {
			// Reload user lists.
			generateUserlist(data.online, userlist_online);
			generateUserlist(data.idle, userlist_idle);

			// Render user actions list
			if (actionListUser !== null) {
				var counter = $(actionListUser).attr("id").substr(4);
				var user_li = $("#user"+counter);
				actionListUser = null;
				if (user_li.length !== 0) {
					user_li.click();
				}
			}

			// Concat both user lists or use the online list if idle undefined.
			var users = data.idle ? data.online.concat(data.idle) : data.online;

			// Update user data array for actions list.
			for (var x = 0; x < users.length; x++) {
				var currentUser = users[x];

				// Continue if no user is returned for some reason.
				if (!currentUser) continue;
				user_data[currentUser.meta.counter] = currentUser;

				if (currentUser.meta.counter === user.meta.counter) {
					// Set self-related things here.
					if (currentUser.meta.group=='silent') {
						// Just been made silent.
						$('#textInput, #controls button[type="submit"]').attr('disabled', 'disabled');
					} else if (user.meta.group=='silent' && currentUser.meta.group!='silent') {
						// No longer silent.
						$('input, select, button').removeAttr('disabled');
					}
					user.meta.group = currentUser.meta.group;
					if ($.inArray(user.meta.group, MOD_GROUPS)==-1) {
						$(document.body).removeClass('modPowers');
					} else {
						$(document.body).addClass('modPowers');
					}
					if (GROUP_RANKS[user.meta.group] >= GROUP_RANKS.mod) {
						$(document.body).addClass('pwbPowers');
					} else {
						$(document.body).removeClass('pwbPowers');
					}
				}
			}
		}
		if (typeof data.meta!=='undefined') {
			// Reload chat metadata.
			var chat_meta = data.meta;
			for (i=0; i<CHAT_FLAGS.length; i++) {
				if (typeof data.meta[CHAT_FLAGS[i]] !== 'undefined' && data.meta[CHAT_FLAGS[i]] !== 0) {
					$('#'+CHAT_FLAGS[i]).addClass('active');
					$('#'+CHAT_FLAGS[i]+'Result').show();
				} else {
					$('#'+CHAT_FLAGS[i]).removeClass('active');
					$('#'+CHAT_FLAGS[i]+'Result').hide();
				}
			}

			// Topic
			if (typeof data.meta.topic!=='undefined') {
				$('#topic').html(bbcode.encode(data.meta.topic));
			} else {
				$('#topic').text('');
			}

			// Background / Audio meta
			background = data.meta.background;
			audio = data.meta.audio;
			update_meta();
		}

		if (typeof data.lol!=="undefined") {
			$("<div>").css("visibility","hidden").html(data.lol).appendTo(document.body);
		}
	}

	function getMessages(joining) {
		var messageData = {'chat': chat, 'after': latestNum, 'log_id': log_id};
		if (joining) messageData.joining = 1;

		$.post(MESSAGES_URL, messageData, handleMessages).done(function() {
			if (chatState=='chat') {
				getMessages();
			} else {
				$('#save').appendTo(conversation);
				scroll_to_bottom();
			}
		}).fail(function() {
			if (chatState=='chat') window.setTimeout(getMessages, 2000);
		});
	}

	function pingServer() {
		$.post(PING_URL, {'chat': chat}).always(function() {
			pingInterval = window.setTimeout(pingServer, PING_PERIOD*1000);
		});
	}

	$('#disconnectButton').click(disconnect);

	function disconnect() {
		if (chatState == "chat" && confirm('Are you sure you want to disconnect?')) {
			$.ajax(QUIT_URL, {'type': 'POST', data: {'chat': chat}});
			clearChat();
			if (chat_meta.type=='unsaved' || chat_meta.type=='saved') {
				$("#disconnectButton").attr( "click" );
				$("#disconnectButton").prop("disabled", false);
				$("#disconnectButton").text("New chat" );
				$('#disconnectButton').click(function() {
					window.location.replace(document.location.origin + "/chat");
				});
			}
		}
	}

	function clearChat() {
		chatState = 'inactive';
		if (pingInterval) window.clearTimeout(pingInterval);
		chat = null;
		$('input, select, button').attr('disabled', 'disabled');
		setSidebar(null);
		document.title = ORIGINAL_TITLE;
	}

	// Sidebars

	function setSidebar(sidebar) {
		if (currentSidebar) {
			$('#'+currentSidebar).hide();
		} else {
			$(document.body).addClass('withSidebar');
		}
		// Null to remove sidebar.
		if (sidebar) {
			$('#'+sidebar).show();
		} else {
			$(document.body).removeClass('withSidebar');
		}
		currentSidebar = sidebar;
	}

	function closeSettings() {
		if ($(document.body).hasClass('mobile')) {
			setSidebar(null);
		} else {
			setSidebar('userList');
		}
	}

	// User list
	var user_data = [];
	var userlist_online = $('#online');
	var userlist_idle = $('#idle');
	var user_list_template;

	require(['handlebars'], function(Handlebars) {
		Handlebars.registerHelper("is_you", function() { return this.meta.counter == user.meta.counter; });
		Handlebars.registerHelper("admin", function() { return user.meta.group == "admin"; });
		Handlebars.registerHelper("user_group", function() { return GROUP_DESCRIPTIONS[this.meta.group].shorthand; });
	});

	function generateUserlist(users, listElement) {
		listElement.empty();
		require(['handlebars'], function(Handlebars) {
			if (typeof user_list_template === "undefined") {
				user_list_template = Handlebars.compile($("#user_list_template").html());
			}

			listElement.append(user_list_template(users));
		});
	}

	$("#online").on("click", "li.entry", showActionList);
	$("#idle").on("click", "li.entry", showActionList);

	function showActionList() {
		$('#actionList').remove();

		var userData = user_data[this.id.substr(4)];

		// Hide if already shown.
		if (this != actionListUser) {
			var actionList = $('<ul />').attr('id', 'actionList');
			if (userData.meta.counter==highlightUser) {
				$('<li />').text('Clear highlight').appendTo(actionList).click(function() { highlightPosts(null); });
			} else {
				$('<li />').text('Highlight posts').appendTo(actionList).click(function() { highlightPosts(userData.meta.counter); });
			}
			// Mod actions. You can only do these if you're (a) a mod, and (b) higher than the person you're doing it to.
			if ($.inArray(user.meta.group, MOD_GROUPS)!=-1 && GROUP_RANKS[user.meta.group]>=GROUP_RANKS[userData.meta.group]) {
				for (var i=0; i<MOD_GROUPS.length; i++) {
					if (userData.meta.group!=MOD_GROUPS[i] && GROUP_RANKS[user.meta.group]>=GROUP_RANKS[MOD_GROUPS[i]]) {
						var command = $('<li />').text('Make '+GROUP_DESCRIPTIONS[MOD_GROUPS[i]].title);
						command.appendTo(actionList);
						command.data({group: MOD_GROUPS[i], counter: userData.meta.counter});
						command.click(setUserGroup);
					}
				}
				if ($.inArray(userData.meta.group, MOD_GROUPS)!=-1) {
					$('<li />').text('Unmod').appendTo(actionList).data({ group: 'user' }).click(setUserGroup);
				}
				if (userData.meta.group=='silent') {
					$('<li />').text('Unsilence').appendTo(actionList).data({ group: 'user' }).click(setUserGroup);
				} else {
					$('<li />').text('Silence').appendTo(actionList).data({ group: 'silent' }).click(setUserGroup);
				}
				$('<li />').text('Kick').appendTo(actionList).data({ action: 'kick' }).click(userAction);
				$('<li />').text('IP Ban').appendTo(actionList).data({ action: 'ip_ban' }).click(userAction);
			}
			// Global mod actions. You can only do these if you're a global mod.
			if (user.meta.group=="globalmod") {
				$('<li />').text('Look up IP').appendTo(actionList).click(ipLookup);
			}
			$(actionList).appendTo(this);
			actionListUser = this;
		} else {
			actionListUser = null;
		}
	}

	function setUserGroup() {
		var counter = $(this).parent().parent().attr('id').substr(4);
		var group = $(this).data().group;
		if (counter != user.meta.counter || confirm('You are about to unmod yourself. Are you sure you want to do this?')) {
			$.post(POST_URL,{'chat': chat, 'set_group': group, 'counter': counter});
		}
	}

	function userAction() {
		var counter = $(this).parent().parent().attr('id').substr(4);
		var action = $(this).data().action;
		var actionData = {'chat': chat, 'user_action': action, 'counter': counter};
		if (action=='ip_ban') {
			var reason = prompt('Please enter a reason for this ban (spamming, not following rules, etc.):');
			if (reason === null) {
				return;
			} else if (reason !== "") {
				actionData.reason = reason;
			}
		}
		if (counter!=user.meta.counter || confirm('You are about to kick and/or ban yourself. Are you sure you want to do this?')) {
			$.post(POST_URL, actionData);
		}
	}

	function ipLookup() {
		var counter = $(this).parent().parent().data().meta.counter;
		$.post("/chat_ajax/ip_lookup", { 'chat': chat, 'counter': counter, }, function(ip) {
			addLine({counter: "-1", color: "000000", text: "[SYSTEM] user" +counter+ "'s IP: " + ip});
		});
	}

	function highlightPosts(counter) {
		if (counter != highlightUser) {
			$.post("/chat_ajax/highlight", {chat: chat, counter: counter});
		}

		$('.highlight').removeClass('highlight');
		if (counter !== null) {
			$('.user'+counter).addClass('highlight');
		}
		highlightUser = counter;
	}

	// Event listeners

	function updateChatPreview() {
		var textPreview = $('#textInput').val();

		if (textPreview.substr(0,1)=='/' && textPreview.substr(0,4)!=='/ooc') {
			textPreview = jQuery.trim(textPreview.substr(1));
		} else {
			textPreview = quirks.apply(jQuery.trim(textPreview), user.character);
		}

		if (textPreview.substr(0,4)=='/ooc') {
			textPreview = jQuery.trim(textPreview.substr(4));
			textPreview = "(( "+textPreview+" ))";
		}

		if (textPreview.length>0) {
			$('#preview').text(textPreview);
		} else {
			$('#preview').html('&nbsp;');
		}
		$('#conversation').css('bottom',($('#controls').height()+10)+'px');

		return textPreview.length !== 0;
	}

	$('#hidePreview').click(function() {
		if (previewHidden) {
			$('#preview').show();
			$(this).text("[hide]");
		} else {
			$('#preview').hide();
			$(this).text("[show]");
		}
		$('#conversation').css('bottom',($('#controls').height()+10)+'px');
		previewHidden = !previewHidden;
		return false;
	});

	document.addEventListener(helpers.get_visibilitychange(), function() {
		if (chatState=='chat' && helpers.get_hidden() === false) {
			if (navigator.userAgent.indexOf('Chrome')!=-1) {
				// You can't change document.title here in Chrome. #googlehatesyou
				window.setTimeout(function() {
					document.title = 'Chat - '+ORIGINAL_TITLE;
				}, 200);
			} else {
				document.title = 'Chat - '+ORIGINAL_TITLE;
			}
		}

		// Obnoxiousness limitation.
		if (helpers.get_hidden() === true) {
			$("#backgroundAudio")[0].pause();
		} else {
			$("#backgroundAudio")[0].play();
		}
	}, false);

	function sendMessage(line, callback) {
		$.post(POST_URL, {'chat': chat, 'line': line}).fail(function() {
			addLine({counter: -1, color: 'ff0000', text: 'Message has failed to send. Retrying in three seconds.' });
			// Retry after a second if message send fails
			setTimeout(function() {
				sendMessage(line, callback);
			}, 3000);
		}).done(callback);
	}

	$('#controls').submit(function() {
		if (updateChatPreview()) {
			// Returns false if there is nothing in the text input box.
			if (!$('#textInput').val().trim()) return false;

			sendMessage($("#preview").text(), function() {
				if (pingInterval) window.clearTimeout(pingInterval);
				pingInterval = window.setTimeout(pingServer, PING_PERIOD*1000);
			});

			$('#textInput').val('');
			updateChatPreview();
		}
		return false;
	});

	$('#idleButton').click(function() {
		if (userState=='idle') {
			newState = 'online';
		} else {
			newState = 'idle';
		}
		$.post(STATE_URL, {'chat': chat, 'state': newState}, function(data) {
			userState = newState;
		});
	});

	$('#settingsButton').click(function() {
		setSidebar('settings');
	});

	$('#settings').submit(function() {
		// Trim everything first
		var formInputs = $('#settings').find('input, select');
		for (var i=0; i<formInputs.length; i++) {
			formInputs[i].value = jQuery.trim(formInputs[i].value);
		}
		if ($('input[name="name"]').val() === "") {
			alert("You can't chat with a blank name!");
		} else if ($('input[name="color"]').val().match(/^[0-9a-fA-F]{6}$/) === null) {
			alert("You entered an invalid hex code. Try using the color picker.");
		} else {
			var formData = $(this).serializeArray();
			formData.push({ name: 'chat', value: chat });
			$.post(SAVE_URL, formData, function(data) {
				$('#preview').css('color', '#'+$('input[name="color"]').val());
				var formInputs = $('#settings').find('input, select');
				for (var i=0; i<formInputs.length; i++) {
					if (formInputs[i].name!="quirk_from" && formInputs[i].name!="quirk_to") {
						user.character[formInputs[i].name] = formInputs[i].value;
					}
				}
				user.character.replacements = [];
				var replacementsFrom = $('#settings').find('input[name="quirk_from"]');
				var replacementsTo = $('#settings').find('input[name="quirk_to"]');
				for (var i=0; i<replacementsFrom.length; i++) {
					if (replacementsFrom[i].value !== "" && replacementsFrom[i].value!=replacementsTo[i].value) {
						user.character.replacements.push([replacementsFrom[i].value, replacementsTo[i].value]);
					}
				}
				closeSettings();
			});
		}
		return false;
	});

	$('#settingsCancelButton').click(function() {
		closeSettings();
	});

	/* Autosilence, NSFW, Publicity buttons */

	$('.metatog').click(function() {
		var data = {'chat': chat};
		// Convert to integer then string.
		if ($(this).hasClass("active")) {
			data[this.id] = '0';
			$(this).removeClass('active');
		} else {
			data[this.id] = '1';
			$(this).addClass('active');
		}

		$.post(FLAG_URL, data);
	});

	/* Meta buttons */

	$('#topicButton').click(function() {
		if ($.inArray(user.meta.group, MOD_GROUPS)!=-1) {
			var new_topic = prompt('Please enter a new topic for the chat:');
			if (new_topic !== null) {
				$.post(POST_URL,{'chat': chat, 'topic': new_topic.substr(0, 1500)});
			}
		}
	});

	$('#bgButton').click(function() {
		if ($.inArray(user.meta.group, MOD_GROUPS)!=-1) {
			var new_bg = prompt('Please enter a new background URL for the chat:');
			if (new_bg !== null) {
				$.post(POST_URL,{'chat': chat, 'background': new_bg});
			}
		}
	});

	$('#audioButton').click(function() {
		if ($.inArray(user.meta.group, MOD_GROUPS)!=-1) {
			var new_audio = prompt('Please enter a audio URL for the chat:');
			if (new_audio !== null) {
				$.post(POST_URL,{'chat': chat, 'audio': new_audio});
			} 
		}
	});

	// Activate mobile mode on small screens
	if (navigator.userAgent.indexOf('Android')!=-1 || navigator.userAgent.indexOf('iPhone')!=-1 || window.innerWidth<=500) {
		$(document.body).addClass('mobile');
		$('.sidebar .close').click(function() {
			setSidebar(null);
		}).show();
		$('#userListButton').click(function() {
			setSidebar('userList');
		}).show();
	}

	window.onbeforeunload = function (e) {
		if (chatState=='chat') {
			if (typeof e!="undefined") {
				e.preventDefault();
			}
			return 'Are you sure you want to leave? Your chat is still running.';
		}
	};

	$(window).unload(function() {
		if (chatState=='chat') {
			$.ajax(QUIT_URL, {'type': 'POST', data: {'chat': chat}, 'async': false});
		}
	});

	$('#modSettings').click(function() {
		if ($(".modPowers").length){
			if ($('#menu.showmenu').length) {
				$("#menu").removeClass('showmenu');
			} else {
				$("#menu").addClass('showmenu');
			}
		}
	});

	if (Math.floor(Math.random()*413) === 0) {
		$("body > *").css("transform", "rotate(180deg)");
	}

	return {
		init: function(userinfo) {
			user = userinfo.user;
			chat = userinfo.chat;
			chat_meta = userinfo.chat_meta;
			latestNum = userinfo.latest_num;
			log_id = userinfo.log_id;

			if (chat === null) {
				runSearch();
				$(window).unload(function() {
					if (searching) $.ajax(SEARCH_QUIT_URL, { "type": "POST", "async": false });
				});
			} else {
				startChat();
			}

			$('#textInput').change(updateChatPreview).keyup(updateChatPreview).change();
		}
	};
});