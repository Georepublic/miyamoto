// 入力内容を解析して、メソッドを呼び出す
// Timesheets = loadTimesheets();

loadTimesheets = function (exports) {
  var Timesheets = function (storage, settings, responder) {
    this.storage = storage;
    this.responder = responder;
    this.settings = settings;

    var self = this;
    this.responder.on('receiveMessage', function (username, message) {
      self.receiveMessage(username, message);
    });
  };

  // メッセージを受信する
  Timesheets.prototype.receiveMessage = function (username, message) {
    // 日付は先に処理しておく
    this.date = DateUtils.parseDate(message);
    this.time = DateUtils.parseTime(message);
    this.minutes = DateUtils.parseMinutes(message)
    this.datetime = DateUtils.normalizeDateTime(this.date, this.time, this.minutes);
    if (this.datetime !== null) {
      this.dateStr = DateUtils.format("Y/m/d", this.datetime);
      this.datetimeStr = DateUtils.format("Y/m/d H:M", this.datetime);
    }

    // コマンド集
    var commands = [
      ['actionSignOut', /(バ[ー〜ァ]*イ|ば[ー〜ぁ]*い|おやすみ|お[つっ]ー|おつ|さらば|お先|お疲|帰|乙|bye|night|(c|see)\s*(u|you)|left|退勤|ごきげんよ|グ[ッ]?バイ)/],
      ['actionWhoIsOff', /(だれ|誰|who\s*is).*(休|やす(ま|み|む))/],
      ['actionWhoIsIn', /(だれ|誰|who\s*is)/],
      ['actionBreak', /(休憩|break)/],
      ['actionCancelOff', /(休|やす(ま|み|む)|休暇).*(キャンセル|消|止|やめ|ません)/],
      ['actionOff', /(休|やす(ま|み|む)|休暇)/],
      ['actionSignIn', /(モ[ー〜]+ニン|も[ー〜]+にん|おっは|おは|へろ|はろ|ヘロ|ハロ|hi|hello|morning|ohayo|出勤)/],
      ['confirmSignIn', /__confirmSignIn__/],
      ['confirmSignOut', /__confirmSignOut__/],
    ];

    // メッセージを元にメソッドを探す
    // メッセージから一時的に絵文字を削除
    var emojiRemovedMessage = message.replace(/:[^:\s]*(?:::[^:\s]*)*:/g, '');
    var command = _.find(commands, function (ary) {
      return (ary && emojiRemovedMessage.match(ary[1]));
    });

    // メッセージを実行
    if (command && this[command[0]]) {
      return this[command[0]](username, message);
    }
  }

  // 出勤
  Timesheets.prototype.actionSignIn = function (username, message) {
    if (this.datetime) {
      var data = this.storage.get(username, this.datetime);
      if (!data.signIn || data.signIn === '-') {
        this.storage.set(username, this.datetime, {
          signIn: this.datetime
        });
        this.responder.template("出勤", username, this.datetimeStr);
      } else {
        // 更新の場合は時間を明示する必要がある
        if (!!this.time) {
          this.storage.set(username, this.datetime, {
            signIn: this.datetime
          });
          this.responder.template("出勤更新", username, this.datetimeStr);
        }
      }
    }
  };

  // 退勤
  Timesheets.prototype.actionSignOut = function (username, message) {
    if (this.datetime) {
      var data = this.storage.get(username, this.datetime);
      if (!data.signIn || data.signIn === '-') {
        // まだ出勤前である
        this.responder.template("休憩エラー", username, "");
      } else if (!data.signOut || data.signOut === '-') {
        this.storage.set(username, this.datetime, {
          signOut: this.datetime
        });
        // 5時間以上働いていて、休憩が入っていなければ休憩を更新する
        if (!data.break && (this.datetime - data.signIn) > (5 * 60 * 60 * 1000)) {
          // break 入力
          this.storage.set(username, this.datetime, {
            break: 60
          });
          this.responder.template("退勤と休憩", username, this.datetimeStr);
        } else {
          this.responder.template("退勤", username, this.datetimeStr);
        }
      } else {
        // 更新の場合は時間を明示する必要がある
        if (!!this.time) {
          this.storage.set(username, this.datetime, {
            signOut: this.datetime
          });
          // 5時間以上働いていて、休憩が入っていなければ休憩を更新する
          if (!data.break && (this.datetime - data.signIn) > (5 * 60 * 60 * 1000)) {
            // break 入力
            this.storage.set(username, this.datetime, {
              break: 60
            });
            this.responder.template("退勤更新と休憩", username, this.datetimeStr);
          } else {
            this.responder.template("退勤更新", username, this.datetimeStr);
          }
        }
      }
    }
  };

  // 休憩
  Timesheets.prototype.actionBreak = function (username, time) {
    if (this.minutes) {
      var data = this.storage.get(username, this.datetime);
      if (!data.signIn || data.signIn === '-') {
        // まだ出勤前である
        this.responder.template("休憩エラー", username, "");
      } else {
        // break 入力
        this.storage.set(username, this.datetime, {
          break: this.minutes
        });
        this.responder.template("休憩", username, this.minutes + "分");
      }
    }
  };

  // 休暇申請
  Timesheets.prototype.actionOff = function (username, message) {
    if (this.date) {
      var dateObj = new Date(this.date[0], this.date[1] - 1, this.date[2]);
      var data = this.storage.get(username, dateObj);
      if (!data.signOut || data.signOut === '-') {
        this.storage.set(username, dateObj, {
          signIn: '-',
          signOut: '-',
          note: message
        });
        this.responder.template("休暇", username, DateUtils.format("Y/m/d", dateObj));
      }
    }
  };

  // 休暇取消
  Timesheets.prototype.actionCancelOff = function (username, message) {
    if (this.date) {
      var dateObj = new Date(this.date[0], this.date[1] - 1, this.date[2]);
      var data = this.storage.get(username, dateObj);
      if (!data.signOut || data.signOut === '-') {
        this.storage.set(username, dateObj, {
          signIn: null,
          signOut: null,
          note: message
        });
        this.responder.template("休暇取消", username, DateUtils.format("Y/m/d", dateObj));
      }
    }
  };

  // 出勤中
  Timesheets.prototype.actionWhoIsIn = function (username, message) {
    var dateObj = DateUtils.toDate(DateUtils.now());
    var result = _.compact(_.map(this.storage.getByDate(dateObj), function (row) {
      return _.isDate(row.signIn) && !_.isDate(row.signOut) ? row.user : undefined;
    }));

    if (_.isEmpty(result)) {
      this.responder.template("出勤なし");
    } else {
      this.responder.template("出勤中", result.sort().join(', '));
    }
  };

  // 休暇中
  Timesheets.prototype.actionWhoIsOff = function (username, message) {
    var dateObj = DateUtils.toDate(DateUtils.now());
    var dateStr = DateUtils.format("Y/m/d", dateObj);
    var result = _.compact(_.map(this.storage.getByDate(dateObj), function (row) {
      return row.signIn === '-' ? row.user : undefined;
    }));

    // 定休の処理
    var wday = dateObj.getDay();
    var self = this;
    _.each(this.storage.getUsers(), function (username) {
      if (_.contains(self.storage.getDayOff(username), wday)) {
        result.push(username);
      }
    });
    result = _.uniq(result);

    if (_.isEmpty(result)) {
      this.responder.template("休暇なし", dateStr);
    } else {
      this.responder.template("休暇中", dateStr, result.sort().join(', '));
    }
  };

  // 出勤していない人にメッセージを送る
  Timesheets.prototype.confirmSignIn = function (username, message) {
    var self = this;
    var holidays = _.compact(_.map((this.settings.get("休日") || "").split(','), function (s) {
      var date = DateUtils.parseDateTime(s);
      return date ? DateUtils.format("Y/m/d", date) : undefined;
    }));
    var today = DateUtils.toDate(DateUtils.now());

    // 休日ならチェックしない
    if (_.contains(holidays, DateUtils.format("Y/m/d", today))) return;

    var wday = DateUtils.now().getDay();
    var signedInUsers = _.compact(_.map(this.storage.getByDate(today), function (row) {
      var signedIn = _.isDate(row.signIn);
      var off = (row.signIn === '-') || _.contains(self.storage.getDayOff(row.user), wday);
      return (signedIn || off) ? row.user : undefined;
    }));
    var users = _.difference(this.storage.getUsers(), signedInUsers);

    if (!_.isEmpty(users)) {
      this.responder.template("出勤確認", users.sort());
    }

    // バージョンチェックを行う
    if (typeof checkUpdate == 'function') checkUpdate(this.responder);
  };

  // 退勤していない人にメッセージを送る
  Timesheets.prototype.confirmSignOut = function (username, message) {
    var dateObj = DateUtils.toDate(DateUtils.now());
    var users = _.compact(_.map(this.storage.getByDate(dateObj), function (row) {
      return _.isDate(row.signIn) && !_.isDate(row.signOut) ? row.user : undefined;
    }));

    if (!_.isEmpty(users)) {
      this.responder.template("退勤確認", users.sort());
    }
  };

  return Timesheets;
};

if (typeof exports !== 'undefined') {
  exports.Timesheets = loadTimesheets();
}