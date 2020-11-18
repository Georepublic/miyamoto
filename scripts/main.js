// 各モジュールの読み込み
var initLibraries = function () {
  if (typeof EventListener === 'undefined') EventListener = loadEventListener();
  if (typeof DateUtils === 'undefined') DateUtils = loadDateUtils();
  if (typeof GASProperties === 'undefined') GASProperties = loadGASProperties();
  if (typeof GSProperties === 'undefined') GSProperties = loadGSProperties();
  if (typeof GSTemplate === 'undefined') GSTemplate = loadGSTemplate();
  if (typeof GSTimesheets === 'undefined') GSTimesheets = loadGSTimesheets();
  if (typeof Timesheets === 'undefined') Timesheets = loadTimesheets();
  if (typeof Slack === 'undefined') Slack = loadSlack();
  if (typeof GSBigQuery === 'undefined') GSBigQuery = loadGSBigQuery();
  if (typeof GSCalendar === 'undefined') GSCalendar = loadGSCalendar();
};

var init = function () {
  initLibraries();

  var global_settings = new GASProperties();

  var spreadsheetId = global_settings.get('spreadsheet');
  if (spreadsheetId) {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var settings = new GSProperties(spreadsheet);
    var template = new GSTemplate(spreadsheet);
    var slack = new Slack(settings.get('Slack Incoming URL'), template, settings);
    var storage = new GSTimesheets(spreadsheet, settings);
    var timesheets = new Timesheets(storage, settings, slack);
    var bigquery = null;
    if (global_settings.get('bigQueryProjectID') && global_settings.get('bigQueryDatasetID')) {
      bigquery = new GSBigQuery(spreadsheet, {
        projectID: global_settings.get('bigQueryProjectID'),
        datasetID: global_settings.get('bigQueryDatasetID')
      });
    }
    return ({
      receiver: slack,
      timesheets: timesheets,
      storage: storage,
      bigquery: bigquery
    });
  }
  return null;
}

// SlackのOutgoingから来るメッセージ
function doPost(e) {
  if (e.parameters.user_name == undefined) { // data is undefined (Slack Event)
    var postJSON = JSON.parse(e.postData.getDataAsString());
    // verification Slack Event
    if (postJSON.type == 'url_verification'){
      var out = ContentService.createTextOutput();
      //Mime TypeをJSONに設定
      out.setMimeType(ContentService.MimeType.TEXT);
      //JSONテキストをセットする
      out.setContent(postJSON.challenge);
      return out;
    }else if (postJSON.event.subtype != 'bot_message') {
      var miyamoto = init();
      var userid = String(postJSON.event.user);
      var body = String(postJSON.event.text);
      var token = new GASProperties().get('SLACK_OAUTH_TOKEN');
      var ret = UrlFetchApp.fetch('https://slack.com/api/users.info?token=' + token + '&user=' + userid);
      var userdata = JSON.parse(ret);
      miyamoto.receiver.receiveMessage(userdata.user.name, body);
    }
  }else{ // data is defined (Outgoing web hook)
    var miyamoto = init();
    var username = String(e.parameters.user_name);
    var body = String(e.parameters['text']);
    miyamoto.receiver.receiveMessage(username, body);
  }
}

// Time-based triggerで実行
function confirmSignIn() {
  var miyamoto = init();
  miyamoto.timesheets.confirmSignIn();
}

// Time-based triggerで実行
function confirmSignOut() {
  var miyamoto = init();
  miyamoto.timesheets.confirmSignOut();
}

function pushToBigQuery() {
  var miyamoto = init();
  if (miyamoto.bigquery) {
    miyamoto.bigquery.pushTables();
  }
}


// 初期化する
function setUp() {
  initLibraries();

  // spreadsheetが無かったら初期化
  var global_settings = new GASProperties();
  if (!global_settings.get('spreadsheet')) {

    // タイムシートを作る
    var spreadsheet = SpreadsheetApp.create("Slack Timesheets");
    var sheets = spreadsheet.getSheets();
    if (sheets.length == 1 && sheets[0].getLastRow() == 0) {
      sheets[0].setName('_設定');
    }
    global_settings.set('spreadsheet', spreadsheet.getId());

    var settings = new GSProperties(spreadsheet);
    settings.set('Slack Incoming URL', '');
    settings.setNote('Slack Incoming URL', 'Slackのincoming URLを入力してください');
    settings.set('開始日', DateUtils.format("Y-m-d", DateUtils.now()));
    settings.setNote('開始日', '変更はしないでください');
    settings.set('無視するユーザ', 'miyamoto,hubot,slackbot,incoming-webhook');
    settings.setNote('無視するユーザ', '反応をしないユーザを,区切りで設定する。botは必ず指定してください。');
    settings.set('開始月', 4);
    settings.setNote('開始月', '年度の開始月。変更したら updateCalendar 関数を実行してください');

    var calender = new GSCalendar(spreadsheet, settings);
    calender.setupCalendar();

    // メッセージ用のシートを作成
    new GSTemplate(spreadsheet);

    // 毎日11時頃に出勤してるかチェックする
    ScriptApp.newTrigger('confirmSignIn')
      .timeBased()
      .everyDays(1)
      .atHour(11)
      .create();

    // 毎日22時頃に退勤してるかチェックする
    ScriptApp.newTrigger('confirmSignOut')
      .timeBased()
      .everyDays(1)
      .atHour(22)
      .create();

    // 毎日深夜5時頃に BigQuery テーブルを更新する
    ScriptApp.newTrigger('pushToBigQuery')
      .timeBased()
      .everyDays(1)
      .atHour(5)
      .create();
  }
};
/** update calendar */
function updateCalendar() {
  var miyamoto = init();
  initLibraries();
  var global_settings = new GASProperties();
  var spreadsheetId = global_settings.get('spreadsheet');
  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    settings = new GSProperties(spreadsheet);
  } else {
    console.error("Spreadsheet is not initialized");
    return;
  }
  var calender = new GSCalendar(spreadsheet, settings);
  calender.setupCalendar();

  if (global_settings.get('bigQueryProjectID') && global_settings.get('bigQueryDatasetID')) {
    bigquery = new GSBigQuery(spreadsheet, {
      projectID: global_settings.get('bigQueryProjectID'),
      datasetID: global_settings.get('bigQueryDatasetID')
    });
    bigquery.pushWorkDays();
  }
}

/* バージョンアップ処理を行う */
function migrate() {
  if (typeof GASProperties === 'undefined') GASProperties = loadGASProperties();

  var global_settings = new GASProperties();
  global_settings.set('version', "::VERSION::");
  console.log("バージョンアップが完了しました。");
}



/*
function test1(e) {
  var miyamoto = init();
  miyamoto.receiver.receiveMessage({user_name:"masuidrive", text:"hello 8:00"});
}
*/