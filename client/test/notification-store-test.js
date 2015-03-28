var support = require('./support/setup')
var _ = require('lodash')
var assert = require('assert')
var sinon = require('sinon')
var Immutable = require('immutable')

describe('notification store', function() {
  var actions = require('../lib/actions')
  var Tree = require('../lib/tree')
  var notification = require('../lib/stores/notification')
  var storage = require('../lib/stores/storage')
  var _Notification = window.Notification

  beforeEach(function() {
    sinon.stub(storage, 'set')
    sinon.stub(storage, 'setRoom')
    sinon.stub(Heim, 'setFavicon')
  })

  afterEach(function() {
    window.Notification = _Notification
    storage.set.restore()
    storage.setRoom.restore()
    Heim.setFavicon.restore()
  })

  describe('when unsupported', function() {
    beforeEach(function() {
      delete window.Notification
      support.resetStore(notification.store)
    })

    it('should set unsupported', function() {
      assert.equal(notification.store.getInitialState().popupsSupported, false)
    })
  })

  describe('when supported but not permitted', function() {
    beforeEach(function() {
      window.Notification = {popupsPermission: 'default'}
      support.resetStore(notification.store)
    })

    it('should set supported', function() {
      assert.equal(notification.store.getInitialState().popupsSupported, true)
    })

    it('should set no permission', function() {
      assert.equal(notification.store.getInitialState().popupsPermission, false)
    })

    describe('enabling popups', function() {
      beforeEach(function() {
        Notification.requestPermission = sinon.spy()
      })

      it('should request permission', function() {
        notification.store.enablePopups()
        sinon.assert.calledWithExactly(Notification.requestPermission, notification.store.onPermission)
      })
    })

    describe('receiving permission', function() {
      it('should set popupsPermission', function(done) {
        support.listenOnce(notification.store, function(state) {
          assert.equal(state.popupsPermission, true)
          done()
        })
        notification.store.onPermission('granted')
      })

      it('should store enabled', function() {
        notification.store.onPermission('granted')
        sinon.assert.calledWithExactly(storage.set, 'notify', true)
      })
    })

    describe('receiving denial', function() {
      it('should set no popupsPermission', function(done) {
        support.listenOnce(notification.store, function(state) {
          assert.equal(state.popupsPermission, false)
          done()
        })
        notification.store.onPermission('denied')
      })
    })
  })

  describe('when supported and permitted', function() {
    var message1 = {
      'id': 'id1',
      'time': 123456,
      'sender': {
        'id': '32.64.96.128:12345',
        'name': 'logan',
      },
      'content': 'hello, ezzie!',
    }

    var message2 = {
      'id': 'id2',
      'time': 123457,
      'sender': {
        'id': '32.64.96.128:12345',
        'name': 'ezzie',
      },
      'content': 'woof!',
    }

    var messageMention = {
      'id': 'id3',
      'time': 123457,
      'sender': {
        'id': '32.64.96.128:12345',
        'name': 'tester',
      },
      'content': 'hello @ezzie!',
      'mention': true,
    }

    var messageMentionOld = {
      'id': 'id3',
      'time': Date.now() - notification.store.mentionTTL,
      'sender': {
        'id': '32.64.96.128:12345',
        'name': 'tester',
      },
      'content': 'ancient message!',
      'mention': true,
    }

    var mockChatState = {
      joined: true,
      roomName: 'ezzie',
      messages: new Tree('time').reset([
        message1,
      ])
    }

    var mockChatState2 = {
      joined: true,
      messages: new Tree('time').reset([
        message1,
        message2,
      ])
    }

    var mockChatStateMention = {
      joined: true,
      roomName: 'ezzie',
      messages: new Tree('time').reset([
        message1,
        message2,
        messageMention,
      ])
    }

    var mockChatStateMentionOld = {
      joined: true,
      roomName: 'ezzie',
      messages: new Tree('time').reset([
        message1,
        message2,
        messageMentionOld,
      ])
    }

    var fakeNotification

    beforeEach(function() {
      window.Notification = sinon.spy(function() {
        this.close = sinon.spy(function() {
          if (this.onclose) {
            this.onclose()
          }
        })
        fakeNotification = this
      })
      Notification.permission = 'granted'
      support.resetStore(notification.store)
    })

    it('should set supported', function() {
      assert.equal(notification.store.getInitialState().popupsSupported, true)
    })

    it('should set popupsPermission', function() {
      assert.equal(notification.store.getInitialState().popupsPermission, true)
    })

    describe('enabling popups', function() {
      it('should store enabled', function() {
        notification.store.enablePopups()
        sinon.assert.calledWithExactly(storage.set, 'notify', true)
      })
    })

    describe('disabling popups', function() {
      it('should store disabled', function() {
        notification.store.disablePopups()
        sinon.assert.calledWithExactly(storage.set, 'notify', false)
      })
    })

    describe('when popups enabled', function() {
      beforeEach(function() {
        notification.store.focusChange({windowFocused: false})
        notification.store.storageChange({notify: true, room: {}})
      })

      describe('receiving a message before joined', function() {
        it('should not display a notification', function() {
          notification.store.messageReceived(Immutable.Map(message1), _.extend({}, mockChatState, {joined: false}))
          sinon.assert.notCalled(Notification)
        })
      })

      describe('receiving a message', function() {
        it('should display a notification and set favicon', function() {
          notification.store.messageReceived(Immutable.Map(message1), mockChatState)
          sinon.assert.calledOnce(Notification)
          sinon.assert.calledWithExactly(Notification, 'ezzie', {
            icon: '/static/icon.png',
            body: 'logan: hello, ezzie!',
          })
          sinon.assert.calledOnce(Heim.setFavicon)
          sinon.assert.calledWithExactly(Heim.setFavicon, '/static/favicon-active.png')
        })
      })

      describe('receiving the same message again', function() {
        it('should not display a notification', function() {
          notification.store.messageReceived(Immutable.Map(message1), mockChatState)
          fakeNotification.close()
          notification.store.messageReceived(Immutable.Map(message1), mockChatState)
          sinon.assert.calledOnce(Notification)
        })
      })

      describe('closing and receiving a new message', function() {
        it('should display a second notification', function() {
          notification.store.messageReceived(Immutable.Map(message1), mockChatState)
          fakeNotification.close()
          notification.store.messageReceived(Immutable.Map(message2), mockChatState2)
          sinon.assert.calledTwice(Notification)
        })
      })

      describe('receiving a mention', function() {
        describe('when joined', function() {
          it('should display a notification, set favicon, and store seen', function() {
            notification.store.messagesChanged([messageMention.id], mockChatStateMention)
            sinon.assert.calledOnce(Notification)
            sinon.assert.calledWithExactly(Notification, 'ezzie', {
              icon: '/static/icon-highlight.png',
              body: 'tester: hello @ezzie!',
            })
            sinon.assert.calledOnce(Heim.setFavicon)
            sinon.assert.calledWithExactly(Heim.setFavicon, '/static/favicon-highlight.png')
            sinon.assert.calledOnce(storage.setRoom)
            sinon.assert.calledWithExactly(storage.setRoom, 'ezzie', 'seenMentions', {id3: 43200000})
          })

          it('if seen before should not display a notification', function() {
            notification.store.storageChange({notify: true, room: {ezzie: {seenMentions: {id3: Date.now() + 1000}}}})
            notification.store.messagesChanged([messageMention.id], mockChatStateMention)
            sinon.assert.notCalled(Notification)
            sinon.assert.notCalled(Heim.setFavicon)
          })

          it('if seen before, but expired, should display a notification, set favicon, and store seen', function() {
            notification.store.storageChange({notify: true, room: {ezzie: {seenMentions: {id3: Date.now() - 1000, other: Date.now() - 1000}}}})
            notification.store.messagesChanged([messageMention.id], mockChatStateMention)
            sinon.assert.calledOnce(Heim.setFavicon)
            sinon.assert.calledWithExactly(Heim.setFavicon, '/static/favicon-highlight.png')
            sinon.assert.calledOnce(storage.setRoom)
            sinon.assert.calledWithExactly(storage.setRoom, 'ezzie', 'seenMentions', {id3: 43200000})
          })

          it('if message is older than TTL, should not display a notification', function() {
            notification.store.messagesChanged([messageMention.id], mockChatStateMentionOld)
            sinon.assert.notCalled(Notification)
            sinon.assert.notCalled(Heim.setFavicon)
          })
        })

        describe('when not joined', function() {
          it('should not display a notification', function() {
            notification.store.messagesChanged([messageMention.id], _.assign({}, mockChatStateMention, {joined: false}))
            sinon.assert.notCalled(Notification)
            sinon.assert.notCalled(Heim.setFavicon)
          })
        })
      })
    })

    describe('focus tracking', function() {
      it('should start focused', function() {
        assert.equal(notification.store.focus, true)
      })

      it('should set focused when window focused', function() {
        notification.store.focusChange({windowFocused: true})
        assert.equal(notification.store.focus, true)
      })

      it('should set unfocused when window blurred', function() {
        notification.store.focusChange({windowFocused: false})
        assert.equal(notification.store.focus, false)
      })

      it('should not open notifications when focused', function() {
        notification.store.focusChange({windowFocused: true})
        notification.store.storageChange({notify: true, room: {}})
        notification.store.messageReceived(Immutable.Map(message1), mockChatState)
        sinon.assert.notCalled(Notification)
      })

      it('should close notification when window focused', function() {
        notification.store.focusChange({windowFocused: false})
        notification.store.storageChange({notify: true, room: {}})
        notification.store.messageReceived(Immutable.Map(message1), mockChatState)
        sinon.assert.calledOnce(Notification)
        notification.store.focusChange({windowFocused: true})
        sinon.assert.calledOnce(fakeNotification.close)
      })

      it('should reset favicon when window focused', function() {
        notification.store.focusChange({windowFocused: false})
        notification.store.storageChange({notify: true, room: {}})
        notification.store.messageReceived(Immutable.Map(message1), mockChatState)
        sinon.assert.calledOnce(Heim.setFavicon)
        Heim.setFavicon.reset()

        notification.store.focusChange({windowFocused: true})
        sinon.assert.calledOnce(Heim.setFavicon)
        sinon.assert.calledWithExactly(Heim.setFavicon, '/static/favicon.png')
      })
    })

    describe('with a notification showing', function() {
      beforeEach(function() {
        notification.store.focusChange({windowFocused: false})
        notification.store.storageChange({notify: true, room: {}})
        notification.store.messageReceived(Immutable.Map(message1), mockChatState)
        sinon.stub(actions, 'focusMessage')
        window.uiwindow = {focus: sinon.stub()}
      })

      afterEach(function() {
        actions.focusMessage.restore()
        delete window.uiwindow
      })

      it('should replace with another notification', function() {
        notification.store.messageReceived(Immutable.Map(message2), mockChatState2)
        sinon.assert.calledTwice(Notification)
      })

      it('should focus window and notification when clicked', function() {
        fakeNotification.onclick()
        sinon.assert.calledOnce(window.uiwindow.focus)
        sinon.assert.calledOnce(actions.focusMessage)
        sinon.assert.calledWithExactly(actions.focusMessage, 'id1')
      })

      it('should close after 3 seconds', function() {
        support.clock.tick(3000)
        sinon.assert.calledOnce(fakeNotification.close)
      })

      describe('when window unloading', function() {
        it('should close the notification', function() {
          notification.store.closeAllNotifications()
          sinon.assert.calledOnce(fakeNotification.close)
        })
      })
    })
  })
})
