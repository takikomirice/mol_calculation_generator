// もるくえ！ - Google Apps Script / V8 / HTMLService

const MOL_DRILL_APP_NAME = 'もるくえ！';
const MOL_DRILL_FORMAL_DESCRIPTION = 'Classroom連携型モル計算練習アプリ';
const MOL_DRILL_APP_VERSION = '3.0.0';
const MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE = 40;
const MOL_DRILL_ADMIN_TOKEN_SETTING_KEY = 'ADMIN_TOKEN';
const MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY = 'MOL_DRILL_ADMIN_TOKEN';
const MOL_DRILL_AUTO_REBUILD_CACHE_ENABLED_SETTING_KEY = 'AUTO_REBUILD_CACHE_ENABLED';
const MOL_DRILL_AUTO_REBUILD_CACHE_INTERVAL_MINUTES_SETTING_KEY = 'AUTO_REBUILD_CACHE_INTERVAL_MINUTES';
const MOL_DRILL_AUTO_REBUILD_TRIGGER_HANDLER = 'rebuildAggregateAndMonitorCacheForTrigger_';
const MOL_DRILL_AUTO_REBUILD_ALLOWED_INTERVAL_MINUTES = [1, 5, 10, 15, 30, 60];
const MOL_DRILL_TOKEN_ROW_CACHE_TTL_SECONDS = 120;
const MOL_DRILL_MONITOR_DASHBOARD_CACHE_KEY = 'dashboard';
const MOL_DRILL_MONITOR_SNAPSHOT_VERSION = 2;
const MOL_DRILL_DEFAULT_POST_TEXT_TEMPLATE = 'もるくえ！(モル計算ドリル)の入場URLです。\n\n{{氏名}} さん専用URL:\n{{studentUrl}}\n\nこのURLは本人専用です。他の人に共有しないでください。\n※大きい数は「6.0×10^23」または「6.0x10^23」の形で入力できます。';
const MOL_DRILL_ADMIN_ACTION_LOCK_WAIT_MS = 1000;
const MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE = '別の処理が実行中です。少し待ってから再実行してください。';
const MOL_DRILL_TEACHER_PREVIEW_NONCE_TTL_SECONDS = 60 * 10;
const MOL_DRILL_TEACHER_TEST_STUDENT = {
  courseId: '__TEST__',
  courseName: 'テスト用',
  rosterKey: '__TEST__::test-student',
  studentId: 'test-student',
  number: 'TEST',
  name: 'テスト生徒',
  email: '',
  note: '先生用テストプレイ。Classroomには配付しない。'
};
const MOL_DRILL_LEVEL_SETTING_DEFAULTS = {
  beginner: {
    avogadroConstantKey: 'BEGINNER_AVOGADRO_CONSTANT',
    avogadroConstant: 6.0e23,
    toleranceKey: 'BEGINNER_TOLERANCE',
    tolerance: 0.01
  },
  intermediate: {
    avogadroConstantKey: 'INTERMEDIATE_AVOGADRO_CONSTANT',
    avogadroConstant: 6.0e23,
    toleranceKey: 'INTERMEDIATE_TOLERANCE',
    tolerance: 0.02
  },
  advanced: {
    avogadroConstantKey: 'ADVANCED_AVOGADRO_CONSTANT',
    avogadroConstant: 6.02e23,
    toleranceKey: 'ADVANCED_TOLERANCE',
    tolerance: 0.005
  }
};
const MOL_DRILL_SETTING_DESCRIPTIONS = {
  WEB_APP_URL: 'Webアプリの元URL。生徒用URL、WebモニターURL、テスト生徒用URLの元になります。WebアプリをデプロイしたURLを入力してください。',
  MONITOR_URL: 'Webモニターを開く先生用URL。WEB_APP_URL から自動生成します。生徒には共有しないでください。',
  TEST_STUDENT_URL: '先生が生徒画面をテストプレイするためのURL。自動生成します。Classroomには配付しないでください。',
  ADMIN_TOKEN: '管理ダッシュボード内部認証用トークン。通常は自動管理します。直接編集しないでください。',
  POST_TEXT_TEMPLATE: 'Classroomに投稿する本文テンプレート。必ず {{studentUrl}} を含めてください。{{項目名}} の形で、生徒ごとの情報を差し込めます。デフォルトの値を参考に適宜変更してください。主な差し込み項目: {{氏名}}, {{出席番号}}, {{Classroom名}}, {{studentUrl}}',
  CLASSROOM_SEND_BATCH_SIZE: 'Classroom URL配付の1回あたり最大件数。通常は 40。大人数で失敗する場合は小さくします。',
  DRY_RUN: 'true の場合、Classroom投稿を作成せず配付ログだけ記録します。本送信前の確認では true、本送信時は false にします。',
  ENABLE_DISTRIBUTION_LOG: 'true の場合、Classroom配付結果を配付ログへ記録します。通常は true 推奨です。',
  ENABLE_ADAPTIVE_PROBLEM_SELECTION: 'true の場合、生徒ごとの問題タイプ別キャッシュを使い、未実施・苦手な問題タイプを少し優先します。通常は true 推奨です。',
  AUTO_REBUILD_CACHE_ENABLED: '自動更新で集計キャッシュ・問題タイプ別キャッシュ・モニターキャッシュを定期更新するかどうか。授業中モニター反映を定期的に更新したい場合だけ true にします。通常はメニューから有効化・停止します。',
  AUTO_REBUILD_CACHE_INTERVAL_MINUTES: '自動更新の間隔。1, 5, 10, 15, 30, 60 など。短すぎると Apps Script の実行回数が増えるため、授業中は5分程度を推奨します。',
  BEGINNER_AVOGADRO_CONSTANT: '初級レベルの問題生成と採点に使うアボガドロ定数。例: 6.0×10^23 または 6.0x10^23',
  INTERMEDIATE_AVOGADRO_CONSTANT: '中級レベルの問題生成と採点に使うアボガドロ定数。例: 6.0×10^23 または 6.0x10^23',
  ADVANCED_AVOGADRO_CONSTANT: '上級レベルの問題生成と採点に使うアボガドロ定数。例: 6.02×10^23 または 6.02x10^23',
  BEGINNER_TOLERANCE: '初級レベルの数値解答に使う相対許容誤差。例: 0.01',
  INTERMEDIATE_TOLERANCE: '中級レベルの数値解答に使う相対許容誤差。例: 0.02',
  ADVANCED_TOLERANCE: '上級レベルの数値解答に使う相対許容誤差。例: 0.005'
};

const MOL_DRILL_SHEETS = [
  {
    name: '設定',
    headers: ['キー', '値', '説明', '更新日時'],
    description: 'WebアプリURLや動作設定を保持します。',
    columnWidths: [
      { header: 'キー', width: 220 },
      { header: '値', width: 420 },
      { header: '説明', width: 420 },
      { header: '更新日時', width: 180 }
    ]
  },
  {
    name: 'Classroom一覧',
    headers: ['courseId', 'name', 'section', 'teacherFolderId', 'courseState', '同期対象'],
    description: 'Classroom APIから取得した担当Classroom一覧と同期対象を管理します。',
    columnWidths: [
      { header: 'courseId', width: 180 },
      { header: 'name', width: 240 },
      { header: 'section', width: 160 },
      { header: 'teacherFolderId', width: 260 },
      { header: 'courseState', width: 120 },
      { header: '同期対象', width: 100 }
    ]
  },
  {
    name: '生徒名簿',
    headers: ['courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', '状態'],
    description: 'Classroomごとの生徒情報を管理します。rosterKey は courseId::studentId です。',
    dropdownValidations: [{ header: '状態', values: ['在籍', '退籍'] }],
    columnWidths: [
      { header: 'courseId', width: 180 },
      { header: 'courseName', width: 240 },
      { header: 'rosterKey', width: 260 },
      { header: 'studentId', width: 180 },
      { header: '出席番号', width: 90 },
      { header: '氏名', width: 180 },
      { header: 'メール', width: 260 },
      { header: '状態', width: 90 }
    ]
  },
  {
    name: 'トークン管理',
    headers: ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', '投稿削除', 'note'],
    description: '生徒用WebアプリURLの個別トークンを管理します。',
    columnWidths: [
      { header: 'token', width: 260 },
      { header: 'courseId', width: 180 },
      { header: 'courseName', width: 240 },
      { header: 'rosterKey', width: 260 },
      { header: 'studentId', width: 180 },
      { header: '出席番号', width: 90 },
      { header: '氏名', width: 180 },
      { header: 'メール', width: 260 },
      { header: 'studentUrl', width: 520 },
      { header: 'issuedAt', width: 180 },
      { header: 'lastAccessedAt', width: 180 },
      { header: 'revoked', width: 90 },
      { header: '投稿削除', width: 100 },
      { header: 'note', width: 260 }
    ]
  },
  {
    name: '解答ログ',
    headers: [
      'timestamp',
      'attemptId',
      'token',
      'courseId',
      'courseName',
      'rosterKey',
      'studentId',
      '出席番号',
      '氏名',
      'level',
      'problemType',
      'questionText',
      'expectedAnswer',
      'submittedAnswer',
      'normalizedSubmittedAnswer',
      'unit',
      'isCorrect',
      'tolerance',
      'significantDigits',
      'avogadroConstant',
      'requiresRounding',
      'explanation',
      'elapsedMs',
      'clientInfo'
    ],
    description: '生徒ごとの解答履歴を追記で記録します。',
    checkboxHeaders: ['isCorrect', 'requiresRounding'],
    columnWidths: [
      { header: 'timestamp', width: 180 },
      { header: 'attemptId', width: 220 },
      { header: 'token', width: 220 },
      { header: 'courseId', width: 180 },
      { header: 'courseName', width: 220 },
      { header: 'rosterKey', width: 260 },
      { header: 'studentId', width: 180 },
      { header: '出席番号', width: 90 },
      { header: '氏名', width: 180 },
      { header: 'level', width: 120 },
      { header: 'problemType', width: 160 },
      { header: 'questionText', width: 420 },
      { header: 'expectedAnswer', width: 140 },
      { header: 'submittedAnswer', width: 140 },
      { header: 'normalizedSubmittedAnswer', width: 180 },
      { header: 'unit', width: 90 },
      { header: 'isCorrect', width: 90 },
      { header: 'tolerance', width: 90 },
      { header: 'significantDigits', width: 120 },
      { header: 'avogadroConstant', width: 160 },
      { header: 'requiresRounding', width: 130 },
      { header: 'explanation', width: 420 },
      { header: 'elapsedMs', width: 100 },
      { header: 'clientInfo', width: 260 }
    ]
  },
  {
    name: '配付ログ',
    headers: ['timestamp', 'runId', 'courseId', 'rosterKey', 'studentId', 'token', 'studentUrl', 'classroomAnnouncementId', 'status', 'errorMessage'],
    description: 'Classroomへ個別URLを配付した結果を記録します。',
    columnWidths: [
      { header: 'timestamp', width: 180 },
      { header: 'runId', width: 220 },
      { header: 'courseId', width: 180 },
      { header: 'rosterKey', width: 260 },
      { header: 'studentId', width: 180 },
      { header: 'token', width: 220 },
      { header: 'studentUrl', width: 520 },
      { header: 'classroomAnnouncementId', width: 220 },
      { header: 'status', width: 120 },
      { header: 'errorMessage', width: 420 }
    ]
  },
  {
    name: '集計キャッシュ',
    headers: [
      'updatedAt',
      'courseId',
      'courseName',
      'rosterKey',
      'studentId',
      '出席番号',
      '氏名',
      'totalAttempts',
      'totalCorrect',
      'totalAccuracy',
      'recent10Attempts',
      'recent10Correct',
      'recent10Accuracy',
      'beginnerAttempts',
      'beginnerCorrect',
      'beginnerAccuracy',
      'intermediateAttempts',
      'intermediateCorrect',
      'intermediateAccuracy',
      'advancedAttempts',
      'advancedCorrect',
      'advancedAccuracy',
      'recent10BeginnerAttempts',
      'recent10IntermediateAttempts',
      'recent10AdvancedAttempts',
      'lastAnsweredAt',
      'lastLevel',
      'lastProblemType',
      'averageElapsedMs',
      'medianElapsedMs',
      'recent10AverageElapsedMs',
      'recent10MedianElapsedMs',
      'correctAverageElapsedMs',
      'correctRecent10AverageElapsedMs',
      'first10AverageElapsedMs',
      'speedImprovementRate',
      'lastElapsedMs'
    ].concat(['lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6'].flatMap(level => [level + 'Attempts', level + 'Correct', level + 'Accuracy'])),
    description: '管理画面で使う生徒別集計を保持します。',
    columnWidths: [
      { header: 'updatedAt', width: 180 },
      { header: 'courseId', width: 180 },
      { header: 'courseName', width: 220 },
      { header: 'rosterKey', width: 260 },
      { header: 'studentId', width: 180 },
      { header: '出席番号', width: 90 },
      { header: '氏名', width: 180 },
      { header: 'totalAttempts', width: 120 },
      { header: 'totalCorrect', width: 120 },
      { header: 'totalAccuracy', width: 120 },
      { header: 'recent10Attempts', width: 140 },
      { header: 'recent10Correct', width: 130 },
      { header: 'recent10Accuracy', width: 140 },
      { header: 'beginnerAttempts', width: 140 },
      { header: 'beginnerCorrect', width: 140 },
      { header: 'beginnerAccuracy', width: 140 },
      { header: 'intermediateAttempts', width: 160 },
      { header: 'intermediateCorrect', width: 160 },
      { header: 'intermediateAccuracy', width: 160 },
      { header: 'advancedAttempts', width: 140 },
      { header: 'advancedCorrect', width: 140 },
      { header: 'advancedAccuracy', width: 140 },
      { header: 'recent10BeginnerAttempts', width: 200 },
      { header: 'recent10IntermediateAttempts', width: 220 },
      { header: 'recent10AdvancedAttempts', width: 200 },
      { header: 'lastAnsweredAt', width: 180 },
      { header: 'lastLevel', width: 120 },
      { header: 'lastProblemType', width: 160 },
      { header: 'averageElapsedMs', width: 150 },
      { header: 'medianElapsedMs', width: 150 },
      { header: 'recent10AverageElapsedMs', width: 180 },
      { header: 'recent10MedianElapsedMs', width: 180 },
      { header: 'correctAverageElapsedMs', width: 180 },
      { header: 'correctRecent10AverageElapsedMs', width: 220 },
      { header: 'first10AverageElapsedMs', width: 180 },
      { header: 'speedImprovementRate', width: 170 },
      { header: 'lastElapsedMs', width: 140 }
    ]
  },
  {
    name: '問題タイプ別キャッシュ',
    headers: [
      'updatedAt',
      'courseId',
      'courseName',
      'rosterKey',
      'studentId',
      '出席番号',
      '氏名',
      'level',
      'problemType',
      'attempts',
      'correct',
      'accuracy',
      'recentAttempts',
      'recentCorrect',
      'recentAccuracy',
      'averageElapsedMs',
      'elapsedCount',
      'recentAverageElapsedMs',
      'lastAnsweredAt',
      'lastIsCorrect',
      'lastElapsedMs'
    ],
    description: '生徒ごとのproblemType別成績キャッシュを保持します。',
    checkboxHeaders: ['lastIsCorrect'],
    columnWidths: [
      { header: 'updatedAt', width: 180 },
      { header: 'courseId', width: 180 },
      { header: 'courseName', width: 220 },
      { header: 'rosterKey', width: 260 },
      { header: 'studentId', width: 180 },
      { header: '出席番号', width: 90 },
      { header: '氏名', width: 180 },
      { header: 'level', width: 120 },
      { header: 'problemType', width: 160 },
      { header: 'attempts', width: 110 },
      { header: 'correct', width: 110 },
      { header: 'accuracy', width: 110 },
      { header: 'recentAttempts', width: 140 },
      { header: 'recentCorrect', width: 130 },
      { header: 'recentAccuracy', width: 140 },
      { header: 'averageElapsedMs', width: 160 },
      { header: 'elapsedCount', width: 120 },
      { header: 'recentAverageElapsedMs', width: 190 },
      { header: 'lastAnsweredAt', width: 180 },
      { header: 'lastIsCorrect', width: 120 },
      { header: 'lastElapsedMs', width: 140 }
    ]
  },
  {
    name: 'モニターキャッシュ',
    headers: ['key', 'json', 'updatedAt', 'note'],
    description: 'Webモニター表示用の自動生成JSONキャッシュです。直接編集しないでください。',
    columnWidths: [
      { header: 'key', width: 160 },
      { header: 'json', width: 700 },
      { header: 'updatedAt', width: 180 },
      { header: 'note', width: 260 }
    ]
  },
  {
    name: '実行ログ',
    headers: ['runId', 'operation', 'startedAt', 'finishedAt', 'processedCount', 'successCount', 'errorCount', 'skippedCount', 'nextAction'],
    description: 'トークン発行、Classroom配付、集計更新などの実行単位ログです。',
    columnWidths: [
      { header: 'runId', width: 220 },
      { header: 'operation', width: 180 },
      { header: 'startedAt', width: 180 },
      { header: 'finishedAt', width: 180 },
      { header: 'processedCount', width: 130 },
      { header: 'successCount', width: 120 },
      { header: 'errorCount', width: 120 },
      { header: 'skippedCount', width: 120 },
      { header: 'nextAction', width: 160 }
    ]
  }
];

const MOL_DRILL_DEFAULT_SETTINGS = [
  { key: 'WEB_APP_URL', value: '', description: MOL_DRILL_SETTING_DESCRIPTIONS.WEB_APP_URL },
  { key: 'MONITOR_URL', value: '', description: MOL_DRILL_SETTING_DESCRIPTIONS.MONITOR_URL },
  { key: 'TEST_STUDENT_URL', value: '', description: MOL_DRILL_SETTING_DESCRIPTIONS.TEST_STUDENT_URL },
  { key: MOL_DRILL_ADMIN_TOKEN_SETTING_KEY, value: '', description: MOL_DRILL_SETTING_DESCRIPTIONS.ADMIN_TOKEN },
  { key: 'POST_TEXT_TEMPLATE', value: MOL_DRILL_DEFAULT_POST_TEXT_TEMPLATE, description: MOL_DRILL_SETTING_DESCRIPTIONS.POST_TEXT_TEMPLATE },
  { key: 'CLASSROOM_SEND_BATCH_SIZE', value: String(MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE), description: MOL_DRILL_SETTING_DESCRIPTIONS.CLASSROOM_SEND_BATCH_SIZE },
  { key: 'DRY_RUN', value: 'false', description: MOL_DRILL_SETTING_DESCRIPTIONS.DRY_RUN },
  { key: 'ENABLE_DISTRIBUTION_LOG', value: 'true', description: MOL_DRILL_SETTING_DESCRIPTIONS.ENABLE_DISTRIBUTION_LOG },
  { key: 'ENABLE_ADAPTIVE_PROBLEM_SELECTION', value: 'true', description: MOL_DRILL_SETTING_DESCRIPTIONS.ENABLE_ADAPTIVE_PROBLEM_SELECTION },
  { key: MOL_DRILL_AUTO_REBUILD_CACHE_ENABLED_SETTING_KEY, value: 'false', description: MOL_DRILL_SETTING_DESCRIPTIONS.AUTO_REBUILD_CACHE_ENABLED },
  { key: MOL_DRILL_AUTO_REBUILD_CACHE_INTERVAL_MINUTES_SETTING_KEY, value: '5', description: MOL_DRILL_SETTING_DESCRIPTIONS.AUTO_REBUILD_CACHE_INTERVAL_MINUTES },
  { key: 'BEGINNER_AVOGADRO_CONSTANT', value: '6.0e23', description: MOL_DRILL_SETTING_DESCRIPTIONS.BEGINNER_AVOGADRO_CONSTANT },
  { key: 'INTERMEDIATE_AVOGADRO_CONSTANT', value: '6.0e23', description: MOL_DRILL_SETTING_DESCRIPTIONS.INTERMEDIATE_AVOGADRO_CONSTANT },
  { key: 'ADVANCED_AVOGADRO_CONSTANT', value: '6.02e23', description: MOL_DRILL_SETTING_DESCRIPTIONS.ADVANCED_AVOGADRO_CONSTANT },
  { key: 'BEGINNER_TOLERANCE', value: '0.01', description: MOL_DRILL_SETTING_DESCRIPTIONS.BEGINNER_TOLERANCE },
  { key: 'INTERMEDIATE_TOLERANCE', value: '0.02', description: MOL_DRILL_SETTING_DESCRIPTIONS.INTERMEDIATE_TOLERANCE },
  { key: 'ADVANCED_TOLERANCE', value: '0.005', description: MOL_DRILL_SETTING_DESCRIPTIONS.ADVANCED_TOLERANCE }
];

class LoggerService {
  static logDeveloperInfo(message) {
    try {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log(String(message || ''));
      }
    } catch (_ignored) {
      // Apps Script console can be unavailable in local tests.
    }
  }

  static logDeveloperError(context, error) {
    const message = error && error.stack ? error.stack : String(error);
    try {
      console.error(`${context}: ${message}`);
    } catch (_ignored) {
      // Apps Script console can be unavailable in local tests.
    }
  }
}

function parseBooleanSettingWithDefault_(value, fallback) {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 'はい', '有効', 'オン', 'する'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off', 'いいえ', '無効', 'オフ', 'しない'].includes(normalized)) {
    return false;
  }
  return fallback === true;
}

function isAutoRebuildCacheEnabled_() {
  try {
    return parseBooleanSettingWithDefault_(SheetRepository.getSettingValue(MOL_DRILL_AUTO_REBUILD_CACHE_ENABLED_SETTING_KEY), false);
  } catch (_ignored) {
    return false;
  }
}

function normalizeAutoRebuildCacheIntervalMinutes_(value) {
  const numeric = Number(String(value == null ? '' : value).trim());
  if (Number.isFinite(numeric) && MOL_DRILL_AUTO_REBUILD_ALLOWED_INTERVAL_MINUTES.includes(numeric)) {
    return numeric;
  }
  return 5;
}

class AdminService {
  static isAdminRoute(e) {
    const params = e && e.parameter ? e.parameter : {};
    return Object.prototype.hasOwnProperty.call(params, 'admin') || String(params.page || '').trim() === 'admin';
  }

  static extractTeacherPreviewAuthToken(e) {
    const params = e && e.parameter ? e.parameter : {};
    const nonce = String(params.previewNonce || params.teacherPreviewNonce || '').trim();
    if (nonce !== '') {
      return this.resolveTeacherPreviewNonce_(nonce);
    }
    return '';
  }

  static withAdminActionLock(operationName, callback) {
    if (typeof callback !== 'function') {
      throw new Error('管理操作が指定されていません。');
    }
    if (typeof LockService === 'undefined' || !LockService.getScriptLock) {
      return callback();
    }
    const lock = LockService.getScriptLock();
    let locked = false;
    try {
      try {
        if (typeof lock.tryLock === 'function') {
          locked = lock.tryLock(MOL_DRILL_ADMIN_ACTION_LOCK_WAIT_MS);
        } else {
          lock.waitLock(MOL_DRILL_ADMIN_ACTION_LOCK_WAIT_MS);
          locked = true;
        }
      } catch (_lockError) {
        throw new Error(MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE);
      }
      if (!locked) {
        throw new Error(MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE);
      }
      return callback();
    } finally {
      if (locked) {
        try {
          lock.releaseLock();
        } catch (_ignored) {
          // Ignore release failures to preserve the original operation result.
        }
      }
    }
  }

  static runLoggedOperation(operationName, callback, summarizeResult) {
    if (typeof callback !== 'function') {
      throw new Error('実行する処理が指定されていません。');
    }
    const startedAt = new Date().toISOString();
    const runId = this.createRunId_(operationName);
    try {
      const result = callback();
      const counts = typeof summarizeResult === 'function'
        ? summarizeResult(result)
        : this.summarizeOperationResult_(result);
      this.appendRunLogSafely_({
        runId,
        operation: String(operationName || 'ADMIN_OPERATION'),
        startedAt,
        finishedAt: new Date().toISOString(),
        processedCount: counts.processedCount,
        successCount: counts.successCount,
        errorCount: counts.errorCount,
        skippedCount: counts.skippedCount,
        nextAction: counts.nextAction || 'DONE'
      });
      return result;
    } catch (error) {
      this.appendRunLogSafely_({
        runId,
        operation: String(operationName || 'ADMIN_OPERATION'),
        startedAt,
        finishedAt: new Date().toISOString(),
        processedCount: 0,
        successCount: 0,
        errorCount: 1,
        skippedCount: 0,
        nextAction: this.truncateForLog_(`ERROR: ${this.formatErrorMessage_(error)}`, 160)
      });
      throw error;
    }
  }

  static summarizeOperationResult_(result) {
    const source = result && typeof result === 'object' ? result : {};
    const processedCount = Array.isArray(result)
      ? result.length
      : Number(source.processed || source.processedCount || source.updated || source.issued || source.targetCount || 0);
    const explicitSuccess = source.success != null ? Number(source.success) : NaN;
    const successCount = Number.isFinite(explicitSuccess)
      ? explicitSuccess + Number(source.dryRun || 0)
      : processedCount;
    return {
      processedCount: Number.isFinite(processedCount) ? processedCount : 0,
      successCount: Number.isFinite(successCount) ? successCount : 0,
      errorCount: Number(source.error || source.errorCount || 0),
      skippedCount: Number(source.skipped || source.skippedCount || 0),
      nextAction: String(source.nextAction || 'DONE')
    };
  }

  static appendRunLogSafely_(log) {
    try {
      SheetRepository.appendRunLog(log);
    } catch (error) {
      LoggerService.logDeveloperError('Failed to append admin run log', error);
    }
  }

  static createRunId_(operationName) {
    const safeOperation = String(operationName || 'ADMIN').replace(/[^A-Z0-9_]/gi, '').slice(0, 24) || 'ADMIN';
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const random = Math.random().toString(36).slice(2, 8);
    return `${safeOperation}_${timestamp}_${random}`;
  }

  static formatErrorMessage_(error) {
    return String(error && error.message ? error.message : error);
  }

  static truncateForLog_(value, maxLength) {
    const text = String(value || '');
    const limit = Number(maxLength || 160);
    return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  }

  static normalizeSettingsPayload(payload) {
    const source = payload || {};
    return {
      webAppUrl: String(source.webAppUrl || '').trim(),
      adminToken: String(source.adminToken || '').trim(),
      postTextTemplate: String(source.postTextTemplate || '').trim(),
      dryRun: source.dryRun === true || String(source.dryRun || '').toLowerCase() === 'true',
      batchSize: this.normalizeBatchSize_(source.batchSize, MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE),
      enableDistributionLog: source.enableDistributionLog !== false && String(source.enableDistributionLog || 'true').toLowerCase() !== 'false',
      adaptiveProblemSelection: source.adaptiveProblemSelection !== false && String(source.adaptiveProblemSelection || 'true').toLowerCase() !== 'false',
      beginnerAvogadroConstant: this.normalizePositiveNumber_(source.beginnerAvogadroConstant, MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner.avogadroConstant),
      intermediateAvogadroConstant: this.normalizePositiveNumber_(source.intermediateAvogadroConstant, MOL_DRILL_LEVEL_SETTING_DEFAULTS.intermediate.avogadroConstant),
      advancedAvogadroConstant: this.normalizePositiveNumber_(source.advancedAvogadroConstant, MOL_DRILL_LEVEL_SETTING_DEFAULTS.advanced.avogadroConstant),
      beginnerTolerance: this.normalizePositiveNumber_(source.beginnerTolerance, MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner.tolerance),
      intermediateTolerance: this.normalizePositiveNumber_(source.intermediateTolerance, MOL_DRILL_LEVEL_SETTING_DEFAULTS.intermediate.tolerance),
      advancedTolerance: this.normalizePositiveNumber_(source.advancedTolerance, MOL_DRILL_LEVEL_SETTING_DEFAULTS.advanced.tolerance)
    };
  }

  static applyCourseSelection(rows, selectedCourseIds) {
    const selected = new Set((selectedCourseIds || []).map((courseId) => String(courseId || '').trim()).filter((courseId) => courseId !== ''));
    return (rows || []).map((row) => ({
      ...row,
      checked: String(row.courseState || 'ACTIVE') === 'ACTIVE' && selected.has(String(row.courseId || '').trim())
    }));
  }

  static assertAdminAccess(authToken) {
    const configured = this.getAdminToken();
    if (configured === '') {
      throw new Error('先生用の内部認証が未設定です。スプレッドシートの「★ 先生用URLを設定シートに出力」を実行し、設定シートの MONITOR_URL を開いてください。');
    }
    if (String(authToken || '').trim() !== configured) {
      throw new Error('先生用の内部認証が一致しません。設定シートの MONITOR_URL を開いてください。生徒は先生から配付された本人用URLを使ってください。');
    }
    return true;
  }

  static getOrCreateAdminToken() {
    const existing = this.getAdminToken();
    if (existing !== '') {
      this.mirrorAdminTokenStores_(existing);
      return existing;
    }
    const token = this.generateAdminToken_();
    this.setAdminToken(token);
    return token;
  }

  static getAdminToken() {
    const propertyToken = this.getScriptProperty_(MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY);
    if (propertyToken !== '') {
      return propertyToken;
    }
    try {
      return SheetRepository.getSettingValue(MOL_DRILL_ADMIN_TOKEN_SETTING_KEY);
    } catch (_ignored) {
      return '';
    }
  }

  static setAdminToken(token) {
    const normalized = String(token || '').trim();
    if (normalized === '') {
      return '';
    }
    this.setScriptProperty_(MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY, normalized);
    try {
      SheetRepository.setSettingValue(MOL_DRILL_ADMIN_TOKEN_SETTING_KEY, normalized, '管理ダッシュボード内部認証用トークン。通常は自動管理します。');
    } catch (_ignored) {
      // Settings sheet may not exist yet during the first bootstrap.
    }
    return normalized;
  }

  static mirrorAdminTokenStores_(token) {
    const normalized = String(token || '').trim();
    if (normalized === '') {
      return '';
    }
    if (this.getScriptProperty_(MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY) !== normalized) {
      this.setScriptProperty_(MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY, normalized);
    }
    try {
      if (SheetRepository.getSettingValue(MOL_DRILL_ADMIN_TOKEN_SETTING_KEY) !== normalized) {
        SheetRepository.setSettingValue(MOL_DRILL_ADMIN_TOKEN_SETTING_KEY, normalized, '管理ダッシュボード内部認証用トークン。通常は自動管理します。');
      }
    } catch (_ignored) {
      // Settings sheet may not exist yet during the first bootstrap.
    }
    return normalized;
  }

  static resolveAdminEntryBaseUrl_() {
    try {
      const configured = SheetRepository.getSettingValue('WEB_APP_URL');
      if (configured !== '') {
        return configured;
      }
    } catch (_ignored) {
      // Fall through to deployed service URL.
    }
    try {
      if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
        const service = ScriptApp.getService();
        const serviceUrl = service && service.getUrl ? String(service.getUrl() || '').trim() : '';
        if (serviceUrl !== '') {
          return serviceUrl;
        }
      }
    } catch (_ignored) {
      // Fall through to explicit menu error.
    }
    return '';
  }

  static buildTeacherStudentPreviewUrl(authToken, studentToken) {
    this.assertAdminAccess(authToken);
    const baseUrl = this.resolveAdminEntryBaseUrl_();
    const normalizedBaseUrl = String(baseUrl || '').trim();
    const normalizedStudentToken = String(studentToken || '').trim();
    if (normalizedBaseUrl === '') {
      throw new Error('WebアプリURLを取得できません。Webアプリをデプロイ後、設定シートの WEB_APP_URL にWebアプリURLを設定してください。');
    }
    if (normalizedStudentToken === '') {
      throw new Error('教師プレビューを開く生徒tokenがありません。');
    }
    const separator = normalizedBaseUrl.indexOf('?') === -1
      ? '?'
      : (/[?&]$/.test(normalizedBaseUrl) ? '' : '&');
    const nonce = this.createTeacherPreviewNonce_(authToken);
    return `${normalizedBaseUrl}${separator}preview=teacher&previewNonce=${encodeURIComponent(nonce)}&t=${encodeURIComponent(normalizedStudentToken)}`;
  }

  static createTeacherPreviewNonce_(authToken) {
    const normalizedAuthToken = String(authToken || '').trim();
    const cache = this.getTeacherPreviewNonceCache_();
    if (!cache || typeof cache.put !== 'function') {
      throw new Error('教師プレビュー用の一時認証を作成できません。しばらく待ってから再実行してください。');
    }
    const nonce = `tp_${String(Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g, '')}`;
    cache.put(
      this.createTeacherPreviewNonceCacheKey_(nonce),
      JSON.stringify({ authToken: normalizedAuthToken, createdAt: new Date().toISOString() }),
      MOL_DRILL_TEACHER_PREVIEW_NONCE_TTL_SECONDS
    );
    return nonce;
  }

  static resolveTeacherPreviewNonce_(nonce) {
    const normalizedNonce = String(nonce || '').trim();
    if (normalizedNonce === '') {
      return '';
    }
    const cache = this.getTeacherPreviewNonceCache_();
    const payload = cache && typeof cache.get === 'function'
      ? String(cache.get(this.createTeacherPreviewNonceCacheKey_(normalizedNonce)) || '')
      : '';
    if (payload === '') {
      throw new Error('教師プレビューの一時認証が期限切れです。管理画面から開き直してください。');
    }
    try {
      const parsed = JSON.parse(payload);
      return String(parsed.authToken || '').trim();
    } catch (_error) {
      throw new Error('教師プレビューの一時認証を確認できません。管理画面から開き直してください。');
    }
  }

  static createTeacherPreviewNonceCacheKey_(nonce) {
    return `teacherPreviewNonce:${String(nonce || '').trim()}`;
  }

  static getTeacherPreviewNonceCache_() {
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        return CacheService.getScriptCache();
      }
    } catch (_ignored) {
      return null;
    }
    return null;
  }

  static saveSettingsFromMenu(payload) {
    SheetRepository.assertManagementSheetsReady();
    const current = this.readAdminSettings_();
    const settings = this.normalizeSettingsPayload({
      ...current,
      ...(payload || {})
    });
    this.writeAdminSettingRows_(settings);
    return {
      settings: this.readAdminSettings_()
    };
  }

  static writeAdminSettingRows_(settings) {
    SheetRepository.setSettingValues_(this.buildAdminSettingRows_(settings));
  }

  static buildAdminSettingRows_(settings) {
    return [
      { key: 'WEB_APP_URL', value: settings.webAppUrl, description: MOL_DRILL_SETTING_DESCRIPTIONS.WEB_APP_URL },
      { key: 'POST_TEXT_TEMPLATE', value: settings.postTextTemplate, description: MOL_DRILL_SETTING_DESCRIPTIONS.POST_TEXT_TEMPLATE },
      { key: 'CLASSROOM_SEND_BATCH_SIZE', value: String(settings.batchSize), description: MOL_DRILL_SETTING_DESCRIPTIONS.CLASSROOM_SEND_BATCH_SIZE },
      { key: 'DRY_RUN', value: String(settings.dryRun), description: MOL_DRILL_SETTING_DESCRIPTIONS.DRY_RUN },
      { key: 'ENABLE_DISTRIBUTION_LOG', value: String(settings.enableDistributionLog), description: MOL_DRILL_SETTING_DESCRIPTIONS.ENABLE_DISTRIBUTION_LOG },
      { key: 'ENABLE_ADAPTIVE_PROBLEM_SELECTION', value: String(settings.adaptiveProblemSelection), description: MOL_DRILL_SETTING_DESCRIPTIONS.ENABLE_ADAPTIVE_PROBLEM_SELECTION },
      { key: 'BEGINNER_AVOGADRO_CONSTANT', value: String(settings.beginnerAvogadroConstant), description: MOL_DRILL_SETTING_DESCRIPTIONS.BEGINNER_AVOGADRO_CONSTANT },
      { key: 'INTERMEDIATE_AVOGADRO_CONSTANT', value: String(settings.intermediateAvogadroConstant), description: MOL_DRILL_SETTING_DESCRIPTIONS.INTERMEDIATE_AVOGADRO_CONSTANT },
      { key: 'ADVANCED_AVOGADRO_CONSTANT', value: String(settings.advancedAvogadroConstant), description: MOL_DRILL_SETTING_DESCRIPTIONS.ADVANCED_AVOGADRO_CONSTANT },
      { key: 'BEGINNER_TOLERANCE', value: String(settings.beginnerTolerance), description: MOL_DRILL_SETTING_DESCRIPTIONS.BEGINNER_TOLERANCE },
      { key: 'INTERMEDIATE_TOLERANCE', value: String(settings.intermediateTolerance), description: MOL_DRILL_SETTING_DESCRIPTIONS.INTERMEDIATE_TOLERANCE },
      { key: 'ADVANCED_TOLERANCE', value: String(settings.advancedTolerance), description: MOL_DRILL_SETTING_DESCRIPTIONS.ADVANCED_TOLERANCE }
    ];
  }

  static readAdminSettings_() {
    const batchSize = this.normalizeBatchSize_(SheetRepository.getSettingValue('CLASSROOM_SEND_BATCH_SIZE'), MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE);
    return {
      webAppUrl: SheetRepository.getSettingValue('WEB_APP_URL'),
      adminTokenConfigured: this.getAdminToken() !== '',
      postTextTemplate: SheetRepository.getSettingValue('POST_TEXT_TEMPLATE'),
      dryRun: this.toBoolean_(SheetRepository.getSettingValue('DRY_RUN'), false),
      batchSize,
      enableDistributionLog: this.toBoolean_(SheetRepository.getSettingValue('ENABLE_DISTRIBUTION_LOG'), true),
      adaptiveProblemSelection: this.toBoolean_(SheetRepository.getSettingValue('ENABLE_ADAPTIVE_PROBLEM_SELECTION'), true),
      beginnerAvogadroConstant: this.readPositiveSetting_('BEGINNER_AVOGADRO_CONSTANT', MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner.avogadroConstant),
      intermediateAvogadroConstant: this.readPositiveSetting_('INTERMEDIATE_AVOGADRO_CONSTANT', MOL_DRILL_LEVEL_SETTING_DEFAULTS.intermediate.avogadroConstant),
      advancedAvogadroConstant: this.readPositiveSetting_('ADVANCED_AVOGADRO_CONSTANT', MOL_DRILL_LEVEL_SETTING_DEFAULTS.advanced.avogadroConstant),
      beginnerTolerance: this.readPositiveSetting_('BEGINNER_TOLERANCE', MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner.tolerance),
      intermediateTolerance: this.readPositiveSetting_('INTERMEDIATE_TOLERANCE', MOL_DRILL_LEVEL_SETTING_DEFAULTS.intermediate.tolerance),
      advancedTolerance: this.readPositiveSetting_('ADVANCED_TOLERANCE', MOL_DRILL_LEVEL_SETTING_DEFAULTS.advanced.tolerance)
    };
  }

  static normalizeBatchSize_(value, fallback) {
    const numeric = Number(value || fallback || MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE;
    }
    return Math.max(1, Math.min(Math.floor(numeric), 100));
  }

  static readPositiveSetting_(key, fallback) {
    return this.normalizePositiveNumber_(SheetRepository.getSettingValue(key), fallback);
  }

  static normalizePositiveNumber_(value, fallback) {
    const numeric = typeof MolProblemService !== 'undefined'
      ? MolProblemService.normalizeNumericInput(value)
      : Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    return Number(fallback);
  }

  static toBoolean_(value, fallback) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (text === 'true') {
      return true;
    }
    if (text === 'false') {
      return false;
    }
    return fallback;
  }

  static generateAdminToken_() {
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
      return `adm_${String(Utilities.getUuid()).replace(/[^A-Za-z0-9]/g, '')}`;
    }
    return `adm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  static getScriptProperty_(key) {
    try {
      if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) {
        return '';
      }
      return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
    } catch (_ignored) {
      return '';
    }
  }

  static setScriptProperty_(key, value) {
    try {
      if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
        PropertiesService.getScriptProperties().setProperty(key, String(value || '').trim());
      }
    } catch (_ignored) {
      // Script properties are a convenience mirror; the settings sheet is still updated when available.
    }
  }
}

class SheetRepository {
  static getSheetDefinitions() {
    return MOL_DRILL_SHEETS.map((definition) => ({
      ...definition,
      headers: definition.headers.slice()
    }));
  }

  static getDefaultSettingsForTest() {
    return MOL_DRILL_DEFAULT_SETTINGS.map((setting) => ({ ...setting }));
  }

  static resetExecutionCaches_() {
    this.managedSheetCache_ = {};
    this.headerColumnMapCache_ = {};
    this.managementSheetStatusCache_ = null;
  }

  static getManagedSheetCache_() {
    if (!this.managedSheetCache_) {
      this.managedSheetCache_ = {};
    }
    return this.managedSheetCache_;
  }

  static getHeaderColumnMapCache_() {
    if (!this.headerColumnMapCache_) {
      this.headerColumnMapCache_ = {};
    }
    return this.headerColumnMapCache_;
  }

  static getSheetCacheKey_(sheet) {
    return sheet && sheet.getName ? sheet.getName() : '';
  }

  static invalidateHeaderColumnMap_(sheet) {
    const cacheKey = this.getSheetCacheKey_(sheet);
    if (cacheKey) {
      delete this.getHeaderColumnMapCache_()[cacheKey];
    }
  }

  static ensureSheets() {
    this.resetExecutionCaches_();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = this.ensureSheet_(spreadsheet, definition);
      this.initializeSheet_(sheet, definition);
    }
    AdminService.getOrCreateAdminToken();
    this.resetExecutionCaches_();
    return {
      ok: true,
      message: 'もるくえ！の管理シートを作成・補修しました。'
    };
  }

  static reinitializeSheets() {
    this.resetExecutionCaches_();
    const cache = AnswerService.getStudentAccessCache_();
    if (cache) {
      try { for (const row of this.readTokenRows()) cache.remove(AnswerService.runtimeSummaryKey_(row)); } catch (_) { /* Missing sheets may be repaired below. */ }
    }
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = this.ensureSheet_(spreadsheet, definition);
      this.clearSheetForReinitialization_(sheet);
      this.initializeSheet_(sheet, definition);
    }
    AdminService.getOrCreateAdminToken();
    this.resetExecutionCaches_();
    return {
      ok: true,
      message: '管理シートを全初期化しました。'
    };
  }

  static getManagementSheetStatus() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const missingSheets = [];
    const missingHeadersBySheet = [];
    const unexpectedHeadersBySheet = [];
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = spreadsheet.getSheetByName(definition.name);
      if (!sheet) {
        missingSheets.push(definition.name);
        continue;
      }
      const headerMap = this.getHeaderColumnMap_(sheet);
      const missingHeaders = definition.headers.filter((header) => !headerMap[header]);
      if (missingHeaders.length > 0) {
        missingHeadersBySheet.push({ sheetName: definition.name, headers: missingHeaders });
      }
      const expectedHeaders = new Set(definition.headers);
      const actualHeaders = sheet.getLastColumn() > 0 && sheet.getLastRow() > 0
        ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((header) => this.toString_(header)).filter((header) => header !== '')
        : [];
      const unexpectedHeaders = actualHeaders.filter((header) => !expectedHeaders.has(header));
      if (unexpectedHeaders.length > 0) {
        unexpectedHeadersBySheet.push({ sheetName: definition.name, headers: unexpectedHeaders });
      }
    }
    return {
      ok: missingSheets.length === 0 && missingHeadersBySheet.length === 0,
      missingSheets,
      missingHeadersBySheet,
      unexpectedHeadersBySheet
    };
  }

  static getSchemaStatus() {
    return this.getManagementSheetStatus();
  }

  static assertManagementSheetsReady() {
    if (!this.managementSheetStatusCache_) {
      this.managementSheetStatusCache_ = this.getManagementSheetStatus();
    }
    const status = this.managementSheetStatusCache_;
    if (!status.ok) {
      throw new Error(this.formatManagementSheetStatusMessage_(status));
    }
  }

  static assertManagementSchemaReady() {
    return this.assertManagementSheetsReady();
  }

  static writeCourseListToSheet(courses) {
    if (!Array.isArray(courses)) {
      throw new Error('courses は配列で指定してください。');
    }
    const sheet = this.getManagedSheet_('Classroom一覧');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const existing = new Map(this.readCourseRows().map((row) => [row.courseId, row.checked === true]));
    const rows = courses
      .filter((course) => this.toString_(course.courseState || 'ACTIVE') === 'ACTIVE')
      .map((course) => [
        this.toString_(course.courseId),
        this.toString_(course.name),
        this.toString_(course.section),
        this.toString_(course.teacherFolderId),
        this.toString_(course.courseState || 'ACTIVE'),
        this.formatCourseSyncValue_(existing.get(this.toString_(course.courseId)) === true)
      ]);
    this.writeRowsByHeaders_(sheet, headerMap, MOL_DRILL_SHEETS[1].headers, rows);
  }

  static readCourseRows() {
    const sheet = this.getManagedSheet_('Classroom一覧');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => ({
        courseId: this.toString_(row[headerMap.courseId - 1]),
        name: this.toString_(row[headerMap.name - 1]),
        section: this.toString_(row[headerMap.section - 1]),
        teacherFolderId: this.toString_(row[headerMap.teacherFolderId - 1]),
        courseState: this.toString_(row[headerMap.courseState - 1]),
        checked: this.isCourseSyncEnabled_(row[headerMap['同期対象'] - 1])
      }))
      .filter((row) => row.courseId !== '');
  }

  static getCheckedCourses() {
    return this.readCourseRows().filter((row) => row.checked && row.courseState === 'ACTIVE');
  }

  static setCourseSyncSelection(selectedCourseIds) {
    const rows = AdminService.applyCourseSelection(this.readCourseRows(), selectedCourseIds || []);
    this.writeCourseRows_(rows);
    return rows;
  }

  static writeStudentsToSheet(students, targetCourses) {
    if (!Array.isArray(students)) {
      throw new Error('students は配列で指定してください。');
    }
    const courseNameById = new Map((targetCourses || []).map((course) => [this.toString_(course.courseId), this.toString_(course.name)]));
    const touchedCourseIds = new Set(courseNameById.keys());
    const normalizedStudents = students.map((student) => {
      const courseId = this.toString_(student.courseId);
      touchedCourseIds.add(courseId);
      const studentId = this.toString_(student.studentId);
      return {
        courseId,
        courseName: this.toString_(student.courseName || courseNameById.get(courseId)),
        rosterKey: TokenService.createRosterKey(courseId, studentId),
        studentId,
        number: this.toString_(student.number),
        name: this.toString_(student.name || student.displayName),
        email: this.toString_(student.email || student.emailAddress),
        status: '在籍'
      };
    });
    const existingRows = this.readStudentRows();
    const existingByKey = new Map(existingRows.map((row) => [row.rosterKey, row]));
    const activeKeys = new Set(normalizedStudents.map((student) => student.rosterKey));
    const preserved = existingRows.filter((row) => !touchedCourseIds.has(row.courseId));
    const current = normalizedStudents.map((student) => {
      const existing = existingByKey.get(student.rosterKey);
      return {
        ...student,
        number: existing && existing.number !== '' ? existing.number : student.number,
        name: existing && existing.name !== '' ? existing.name : student.name
      };
    });
    const retired = existingRows
      .filter((row) => touchedCourseIds.has(row.courseId) && !activeKeys.has(row.rosterKey))
      .map((row) => ({ ...row, status: '退籍' }));
    this.writeStudentRows_([...preserved, ...current, ...retired]);
  }

  static readStudentRows() {
    const sheet = this.getManagedSheet_('生徒名簿');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => ({
        courseId: this.toString_(row[headerMap.courseId - 1]),
        courseName: this.toString_(row[headerMap.courseName - 1]),
        rosterKey: this.toString_(row[headerMap.rosterKey - 1]),
        studentId: this.toString_(row[headerMap.studentId - 1]),
        number: this.toString_(row[headerMap['出席番号'] - 1]),
        name: this.toString_(row[headerMap['氏名'] - 1]),
        email: this.toString_(row[headerMap['メール'] - 1]),
        status: this.toString_(row[headerMap['状態'] - 1])
      }))
      .filter((row) => row.rosterKey !== '');
  }

  static getStudentsForCheckedCourses() {
    const checkedCourseIds = new Set(this.getCheckedCourses().map((course) => course.courseId));
    return this.readStudentRows().filter((student) => checkedCourseIds.has(student.courseId) && student.status !== '退籍');
  }

  static getActiveStudents() {
    return this.readStudentRows().filter((student) => student.status !== '退籍');
  }

  static readTokenRows() {
    const sheet = this.getManagedSheet_('トークン管理');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => ({
        token: this.toString_(row[headerMap.token - 1]),
        courseId: this.toString_(row[headerMap.courseId - 1]),
        courseName: this.toString_(row[headerMap.courseName - 1]),
        rosterKey: this.toString_(row[headerMap.rosterKey - 1]),
        studentId: this.toString_(row[headerMap.studentId - 1]),
        number: this.toString_(row[headerMap['出席番号'] - 1]),
        name: this.toString_(row[headerMap['氏名'] - 1]),
        email: this.toString_(row[headerMap['メール'] - 1]),
        studentUrl: this.toString_(row[headerMap.studentUrl - 1]),
        issuedAt: this.toString_(row[headerMap.issuedAt - 1]),
        lastAccessedAt: headerMap.lastAccessedAt ? this.toString_(row[headerMap.lastAccessedAt - 1]) : '',
        revoked: this.isFlagEnabled_(headerMap.revoked ? row[headerMap.revoked - 1] : ''),
        postDeletionRequested: this.isRequestFlag_(headerMap['投稿削除'] ? row[headerMap['投稿削除'] - 1] : ''),
        postDeletionStatus: this.normalizePostDeletionStatus_(headerMap['投稿削除'] ? row[headerMap['投稿削除'] - 1] : ''),
        note: this.toString_(row[headerMap.note - 1])
      }))
      .filter((row) => row.token !== '' || row.rosterKey !== '');
  }

  static tokenObjectToRow_(row) {
    const source = row || {};
    const postDeletionRequestSource = source.postDeletionRequested != null
      ? source.postDeletionRequested
      : (source.deletePostRequested != null ? source.deletePostRequested : source['投稿削除']);
    const postDeletionStatusSource = source.postDeletionStatus != null ? source.postDeletionStatus : source['投稿削除'];
    const postDeletionRequested = this.isRequestFlag_(postDeletionRequestSource);
    return {
      token: this.toString_(source.token),
      courseId: this.toString_(source.courseId),
      courseName: this.toString_(source.courseName),
      rosterKey: this.toString_(source.rosterKey),
      studentId: this.toString_(source.studentId),
      number: this.toString_(source['出席番号'] != null ? source['出席番号'] : source.number),
      name: this.toString_(source['氏名'] != null ? source['氏名'] : source.name),
      email: this.toString_(source['メール'] != null ? source['メール'] : source.email),
      studentUrl: this.toString_(source.studentUrl),
      issuedAt: this.toString_(source.issuedAt),
      lastAccessedAt: this.toString_(source.lastAccessedAt),
      revoked: this.isFlagEnabled_(source.revoked),
      postDeletionRequested,
      postDeletionStatus: postDeletionRequested ? '' : this.normalizePostDeletionStatus_(postDeletionStatusSource),
      note: this.toString_(source.note)
    };
  }

  static writeTokenRows(rows) {
    const sheet = this.getManagedSheet_('トークン管理');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const values = rows.map((row) => ({
      token: row.token,
      courseId: row.courseId,
      courseName: row.courseName,
      rosterKey: row.rosterKey,
      studentId: row.studentId,
      '出席番号': row.number,
      '氏名': row.name,
      'メール': row.email,
      studentUrl: row.studentUrl,
      issuedAt: row.issuedAt,
      lastAccessedAt: row.lastAccessedAt || '',
      revoked: this.formatCompletedFlagValue_(this.isFlagEnabled_(row.revoked)),
      '投稿削除': this.formatPostDeletionValue_(row),
      note: row.note || ''
    }));
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('トークン管理').headers, values);
  }

  static recordTokenAccess(token, accessedAt) {
    const normalizedToken = this.toString_(token);
    if (normalizedToken === '') {
      throw new Error('アクセス記録対象のtokenが空です。');
    }
    const rowIndex = this.findRowIndexByHeaderValue_('トークン管理', 'token', normalizedToken, { matchCase: true });
    if (!rowIndex) {
      throw new Error(`アクセス記録対象のtokenが見つかりません: ${normalizedToken}`);
    }
    const current = this.tokenObjectToRow_(this.readObjectAtRow_('トークン管理', rowIndex) || {});
    const updated = {
      ...current,
      lastAccessedAt: this.toString_(accessedAt)
    };
    // lastAccessedAtは授業開始時に集中するため、行全体の再書き込みではなく1セル更新に限定する。
    const updatedCell = this.updateCellByHeader_('トークン管理', rowIndex, 'lastAccessedAt', updated.lastAccessedAt);
    if (!updatedCell) {
      throw new Error('トークン管理シートのlastAccessedAt列を更新できません。');
    }
    return updated;
  }

  static findToken(token) {
    const normalizedToken = this.toString_(token);
    if (normalizedToken === '') {
      return null;
    }
    // token検証は生徒アクセスごとに走るため、全行読み込みを避けてtoken列だけを検索する。
    const sheet = this.getStudentRuntimeSheet_('トークン管理');
    const rowIndex = this.findRowIndexByHeaderValueInSheet_(sheet, 'token', normalizedToken, { matchCase: true });
    if (!rowIndex) {
      return null;
    }
    return this.tokenObjectToRow_(this.readObjectAtRowFromSheet_(sheet, rowIndex) || {});
  }

  static appendAnswerLog(entry) {
    const sheet = this.getStudentRuntimeSheet_('解答ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const row = new Array(Math.max(1, ...Object.values(headerMap))).fill('');
    const values = {
      timestamp: entry.timestamp,
      attemptId: entry.attemptId,
      token: entry.token,
      courseId: entry.courseId,
      courseName: entry.courseName,
      rosterKey: entry.rosterKey,
      studentId: entry.studentId,
      '出席番号': entry.number,
      '氏名': entry.name,
      level: entry.level,
      problemType: entry.problemType,
      questionText: entry.questionText,
      expectedAnswer: entry.expectedAnswer,
      submittedAnswer: entry.submittedAnswer,
      normalizedSubmittedAnswer: entry.normalizedSubmittedAnswer,
      unit: entry.unit,
      isCorrect: entry.isCorrect === true,
      tolerance: entry.tolerance,
      significantDigits: entry.significantDigits,
      avogadroConstant: entry.avogadroConstant,
      requiresRounding: entry.requiresRounding === true,
      explanation: entry.explanation,
      elapsedMs: entry.elapsedMs,
      clientInfo: entry.clientInfo
    };
    for (const key of Object.keys(values)) {
      if (headerMap[key]) {
        row[headerMap[key] - 1] = values[key];
      }
    }
    // Single-row append avoids last-row/capacity RPCs while the shared lock is held.
    sheet.appendRow(row);
  }

  static findAnswerLogByAttemptId(rosterKey, attemptId) {
    const normalizedRosterKey = this.toString_(rosterKey);
    const normalizedAttemptId = this.toString_(attemptId);
    if (normalizedRosterKey === '' || normalizedAttemptId === '') {
      return null;
    }
    const sheet = this.getStudentRuntimeSheet_('解答ログ');
    const rows = this.findObjectsByHeaderValueInSheet_(sheet, 'attemptId', normalizedAttemptId, { matchCase: true });
    for (const row of rows) {
      const answerLog = this.answerLogObjectToRow_(row);
      if (answerLog.rosterKey === normalizedRosterKey) {
        return answerLog;
      }
    }
    return null;
  }

  static readAnswerLogsForRosterKey(rosterKey) {
    const normalizedRosterKey = this.toString_(rosterKey);
    if (normalizedRosterKey === '') {
      return [];
    }
    // 解答送信後の集計は生徒別ログだけで足りるため、全行読み込みを避ける。
    return this.findObjectsByHeaderValueInSheet_(this.getManagedSheetWithoutSchemaCheck_('解答ログ'), 'rosterKey', normalizedRosterKey, { matchCase: true })
      .map((row) => this.answerLogObjectToRow_(row))
      .filter((row) => row.rosterKey === normalizedRosterKey);
  }

  static readAnswerLogs() {
    const sheet = this.getManagedSheet_('解答ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => this.answerLogObjectToRow_(this.rowValuesToObject_(headerMap, row)))
      .filter((row) => row.rosterKey !== '');
  }

  static readLatestAnswerLogs(limit) {
    return this.readLatestRowsAsObjects_('解答ログ', limit)
      .map((row) => this.answerLogObjectToRow_(row))
      .filter((row) => row.rosterKey !== '');
  }

  static readLatestAnswerLogsForRosterKey(rosterKey, limit) {
    const normalizedRosterKey = this.toString_(rosterKey);
    const numericLimit = Number(limit || 0);
    const maxRows = Number.isFinite(numericLimit) ? Math.max(0, Math.floor(numericLimit)) : 0;
    if (normalizedRosterKey === '' || maxRows <= 0) {
      return [];
    }
    const sheet = this.getManagedSheet_('解答ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const rosterColumn = headerMap.rosterKey;
    const lastRow = sheet.getLastRow();
    const width = sheet.getLastColumn();
    if (!rosterColumn || lastRow < 2 || width < 1) {
      return [];
    }
    const rows = [];
    const chunkSize = Math.max(50, Math.min(300, maxRows * 25));
    for (let endRow = lastRow; endRow >= 2 && rows.length < maxRows; endRow -= chunkSize) {
      const startRow = Math.max(2, endRow - chunkSize + 1);
      const values = sheet.getRange(startRow, 1, endRow - startRow + 1, width).getValues();
      for (let index = values.length - 1; index >= 0 && rows.length < maxRows; index -= 1) {
        const source = values[index];
        if (this.toString_(source[rosterColumn - 1]) !== normalizedRosterKey) {
          continue;
        }
        rows.unshift(this.answerLogObjectToRow_(this.rowValuesToObject_(headerMap, source)));
      }
    }
    return rows;
  }

  static readLatestAnswerLogsForRosterKeyLevelProblemType(rosterKey, level, problemType, limit) {
    const normalizedRosterKey = this.toString_(rosterKey);
    const normalizedLevel = this.toString_(level);
    const normalizedProblemType = this.toString_(problemType);
    const numericLimit = Number(limit || 0);
    const maxRows = Number.isFinite(numericLimit) ? Math.max(0, Math.floor(numericLimit)) : 0;
    if (normalizedRosterKey === '' || normalizedLevel === '' || normalizedProblemType === '' || maxRows <= 0) {
      return [];
    }
    const sheet = this.getManagedSheet_('解答ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const rosterColumn = headerMap.rosterKey;
    const levelColumn = headerMap.level;
    const problemTypeColumn = headerMap.problemType;
    const lastRow = sheet.getLastRow();
    const width = sheet.getLastColumn();
    if (!rosterColumn || !levelColumn || !problemTypeColumn || lastRow < 2 || width < 1) {
      return [];
    }
    const rows = [];
    const chunkSize = Math.max(50, Math.min(300, maxRows * 35));
    for (let endRow = lastRow; endRow >= 2 && rows.length < maxRows; endRow -= chunkSize) {
      const startRow = Math.max(2, endRow - chunkSize + 1);
      const values = sheet.getRange(startRow, 1, endRow - startRow + 1, width).getValues();
      for (let index = values.length - 1; index >= 0 && rows.length < maxRows; index -= 1) {
        const source = values[index];
        if (
          this.toString_(source[rosterColumn - 1]) !== normalizedRosterKey ||
          this.toString_(source[levelColumn - 1]) !== normalizedLevel ||
          this.toString_(source[problemTypeColumn - 1]) !== normalizedProblemType
        ) {
          continue;
        }
        rows.unshift(this.answerLogObjectToRow_(this.rowValuesToObject_(headerMap, source)));
      }
    }
    return rows;
  }

  static answerLogObjectToRow_(row) {
    const source = row || {};
    return {
      timestamp: this.toString_(source.timestamp),
      attemptId: this.toString_(source.attemptId),
      token: this.toString_(source.token),
      courseId: this.toString_(source.courseId),
      courseName: this.toString_(source.courseName),
      rosterKey: this.toString_(source.rosterKey),
      studentId: this.toString_(source.studentId),
      number: this.toString_(source['出席番号'] != null ? source['出席番号'] : source.number),
      name: this.toString_(source['氏名'] != null ? source['氏名'] : source.name),
      level: this.toString_(source.level),
      problemType: this.toString_(source.problemType),
      questionText: this.toString_(source.questionText),
      questionHtml: MolProblemService.formatChemicalTextHtml_(source.questionText),
      expectedAnswer: this.toString_(source.expectedAnswer),
      submittedAnswer: this.toString_(source.submittedAnswer),
      normalizedSubmittedAnswer: this.toString_(source.normalizedSubmittedAnswer),
      unit: this.toString_(source.unit),
      isCorrect: source.isCorrect === true || this.toString_(source.isCorrect).toLowerCase() === 'true',
      tolerance: this.toString_(source.tolerance),
      significantDigits: this.toString_(source.significantDigits),
      avogadroConstant: this.toString_(source.avogadroConstant),
      requiresRounding: source.requiresRounding === true || this.toString_(source.requiresRounding).toLowerCase() === 'true',
      explanation: this.toString_(source.explanation),
      elapsedMs: Number(source.elapsedMs || 0),
      clientInfo: this.toString_(source.clientInfo)
    };
  }

  static upsertAggregateCacheRow(summary) {
    const normalizedRosterKey = this.toString_(summary.rosterKey);
    if (normalizedRosterKey === '') {
      throw new Error('集計キャッシュ更新対象のrosterKeyが空です。');
    }
    const valuesByHeader = this.aggregateCacheSummaryToHeaderValues_(summary);
    const rowIndex = this.findRowIndexByHeaderValue_('集計キャッシュ', 'rosterKey', normalizedRosterKey, { matchCase: true });
    if (rowIndex) {
      this.updateObjectRowByHeaders_('集計キャッシュ', rowIndex, valuesByHeader);
      return;
    }
    this.appendObjectRow_('集計キャッシュ', valuesByHeader);
  }

  static writeAggregateCache(rows) {
    const sheet = this.getManagedSheet_('集計キャッシュ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const headers = this.getSheetDefinition_('集計キャッシュ').headers;
    const values = rows.map((row) => [
      row.updatedAt,
      row.courseId,
      row.courseName,
      row.rosterKey,
      row.studentId,
      row.number,
      row.name,
      row.totalAttempts,
      row.totalCorrect,
      row.totalAccuracy,
      row.recent10Attempts,
      row.recent10Correct,
      row.recent10Accuracy,
      row.beginnerAttempts,
      row.beginnerCorrect || 0,
      row.beginnerAccuracy || 0,
      row.intermediateAttempts,
      row.intermediateCorrect || 0,
      row.intermediateAccuracy || 0,
      row.advancedAttempts,
      row.advancedCorrect || 0,
      row.advancedAccuracy || 0,
      row.recent10BeginnerAttempts || 0,
      row.recent10IntermediateAttempts || 0,
      row.recent10AdvancedAttempts || 0,
      row.lastAnsweredAt || '',
      row.lastLevel || '',
      row.lastProblemType || '',
      row.averageElapsedMs || 0,
      row.medianElapsedMs || 0,
      row.recent10AverageElapsedMs || 0,
      row.recent10MedianElapsedMs || 0,
      row.correctAverageElapsedMs || 0,
      row.correctRecent10AverageElapsedMs || 0,
      row.first10AverageElapsedMs || 0,
      row.speedImprovementRate || 0,
      row.lastElapsedMs || 0
    ].concat(Object.values(MolProblemService.practiceLevelMetrics_(row))));
    this.writeRowsByHeaders_(sheet, headerMap, headers, values);
  }

  static readAggregateCache() {
    const sheet = this.getManagedSheet_('集計キャッシュ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => ({
        updatedAt: this.toString_(row[headerMap.updatedAt - 1]),
        courseId: this.toString_(row[headerMap.courseId - 1]),
        courseName: this.toString_(row[headerMap.courseName - 1]),
        rosterKey: this.toString_(row[headerMap.rosterKey - 1]),
        studentId: this.toString_(row[headerMap.studentId - 1]),
        number: this.toString_(row[headerMap['出席番号'] - 1]),
        name: this.toString_(row[headerMap['氏名'] - 1]),
        totalAttempts: Number(row[headerMap.totalAttempts - 1] || 0),
        totalCorrect: Number(row[headerMap.totalCorrect - 1] || 0),
        totalAccuracy: Number(row[headerMap.totalAccuracy - 1] || 0),
        recent10Attempts: Number(row[headerMap.recent10Attempts - 1] || 0),
        recent10Correct: Number(row[headerMap.recent10Correct - 1] || 0),
        recent10Accuracy: Number(row[headerMap.recent10Accuracy - 1] || 0),
        ...MolProblemService.practiceLevelMetrics_(this.rowValuesToObject_(headerMap, row)),
        beginnerAttempts: Number(row[headerMap.beginnerAttempts - 1] || 0),
        beginnerCorrect: headerMap.beginnerCorrect ? Number(row[headerMap.beginnerCorrect - 1] || 0) : 0,
        beginnerAccuracy: headerMap.beginnerAccuracy ? Number(row[headerMap.beginnerAccuracy - 1] || 0) : 0,
        intermediateAttempts: Number(row[headerMap.intermediateAttempts - 1] || 0),
        intermediateCorrect: headerMap.intermediateCorrect ? Number(row[headerMap.intermediateCorrect - 1] || 0) : 0,
        intermediateAccuracy: headerMap.intermediateAccuracy ? Number(row[headerMap.intermediateAccuracy - 1] || 0) : 0,
        advancedAttempts: Number(row[headerMap.advancedAttempts - 1] || 0),
        advancedCorrect: headerMap.advancedCorrect ? Number(row[headerMap.advancedCorrect - 1] || 0) : 0,
        advancedAccuracy: headerMap.advancedAccuracy ? Number(row[headerMap.advancedAccuracy - 1] || 0) : 0,
        recent10BeginnerAttempts: headerMap.recent10BeginnerAttempts ? Number(row[headerMap.recent10BeginnerAttempts - 1] || 0) : 0,
        recent10IntermediateAttempts: headerMap.recent10IntermediateAttempts ? Number(row[headerMap.recent10IntermediateAttempts - 1] || 0) : 0,
        recent10AdvancedAttempts: headerMap.recent10AdvancedAttempts ? Number(row[headerMap.recent10AdvancedAttempts - 1] || 0) : 0,
        lastAnsweredAt: headerMap.lastAnsweredAt ? this.toString_(row[headerMap.lastAnsweredAt - 1]) : '',
        lastLevel: headerMap.lastLevel ? this.toString_(row[headerMap.lastLevel - 1]) : '',
        lastProblemType: headerMap.lastProblemType ? this.toString_(row[headerMap.lastProblemType - 1]) : '',
        averageElapsedMs: headerMap.averageElapsedMs ? Number(row[headerMap.averageElapsedMs - 1] || 0) : 0,
        medianElapsedMs: headerMap.medianElapsedMs ? Number(row[headerMap.medianElapsedMs - 1] || 0) : 0,
        recent10AverageElapsedMs: headerMap.recent10AverageElapsedMs ? Number(row[headerMap.recent10AverageElapsedMs - 1] || 0) : 0,
        recent10MedianElapsedMs: headerMap.recent10MedianElapsedMs ? Number(row[headerMap.recent10MedianElapsedMs - 1] || 0) : 0,
        correctAverageElapsedMs: headerMap.correctAverageElapsedMs ? Number(row[headerMap.correctAverageElapsedMs - 1] || 0) : 0,
        correctRecent10AverageElapsedMs: headerMap.correctRecent10AverageElapsedMs ? Number(row[headerMap.correctRecent10AverageElapsedMs - 1] || 0) : 0,
        first10AverageElapsedMs: headerMap.first10AverageElapsedMs ? Number(row[headerMap.first10AverageElapsedMs - 1] || 0) : 0,
        speedImprovementRate: headerMap.speedImprovementRate ? Number(row[headerMap.speedImprovementRate - 1] || 0) : 0,
        lastElapsedMs: headerMap.lastElapsedMs ? Number(row[headerMap.lastElapsedMs - 1] || 0) : 0
      }))
      .filter((row) => row.rosterKey !== '');
  }

  static findAggregateCacheByRosterKey(rosterKey) {
    const normalizedRosterKey = this.toString_(rosterKey);
    if (normalizedRosterKey === '') {
      return null;
    }
    const rowIndex = this.findRowIndexByHeaderValue_('集計キャッシュ', 'rosterKey', normalizedRosterKey, { matchCase: true });
    if (!rowIndex) {
      return null;
    }
    return this.aggregateCacheObjectToRow_(this.readObjectAtRow_('集計キャッシュ', rowIndex) || {});
  }

  static aggregateCacheObjectToRow_(row) {
    const source = row || {};
    return {
      updatedAt: this.toString_(source.updatedAt),
      courseId: this.toString_(source.courseId),
      courseName: this.toString_(source.courseName),
      rosterKey: this.toString_(source.rosterKey),
      studentId: this.toString_(source.studentId),
      number: this.toString_(source['出席番号'] != null ? source['出席番号'] : source.number),
      name: this.toString_(source['氏名'] != null ? source['氏名'] : source.name),
      totalAttempts: Number(source.totalAttempts || 0),
      totalCorrect: Number(source.totalCorrect || 0),
      totalAccuracy: Number(source.totalAccuracy || 0),
      recent10Attempts: Number(source.recent10Attempts || 0),
      recent10Correct: Number(source.recent10Correct || 0),
      recent10Accuracy: Number(source.recent10Accuracy || 0),
      ...MolProblemService.practiceLevelMetrics_(source),
      beginnerAttempts: Number(source.beginnerAttempts || 0),
      beginnerCorrect: Number(source.beginnerCorrect || 0),
      beginnerAccuracy: Number(source.beginnerAccuracy || 0),
      intermediateAttempts: Number(source.intermediateAttempts || 0),
      intermediateCorrect: Number(source.intermediateCorrect || 0),
      intermediateAccuracy: Number(source.intermediateAccuracy || 0),
      advancedAttempts: Number(source.advancedAttempts || 0),
      advancedCorrect: Number(source.advancedCorrect || 0),
      advancedAccuracy: Number(source.advancedAccuracy || 0),
      recent10BeginnerAttempts: Number(source.recent10BeginnerAttempts || 0),
      recent10IntermediateAttempts: Number(source.recent10IntermediateAttempts || 0),
      recent10AdvancedAttempts: Number(source.recent10AdvancedAttempts || 0),
      lastAnsweredAt: this.toString_(source.lastAnsweredAt),
      lastLevel: this.toString_(source.lastLevel),
      lastProblemType: this.toString_(source.lastProblemType),
      averageElapsedMs: Number(source.averageElapsedMs || 0),
      medianElapsedMs: Number(source.medianElapsedMs || 0),
      recent10AverageElapsedMs: Number(source.recent10AverageElapsedMs || 0),
      recent10MedianElapsedMs: Number(source.recent10MedianElapsedMs || 0),
      correctAverageElapsedMs: Number(source.correctAverageElapsedMs || 0),
      correctRecent10AverageElapsedMs: Number(source.correctRecent10AverageElapsedMs || 0),
      first10AverageElapsedMs: Number(source.first10AverageElapsedMs || 0),
      speedImprovementRate: Number(source.speedImprovementRate || 0),
      lastElapsedMs: Number(source.lastElapsedMs || 0)
    };
  }

  static aggregateCacheSummaryToHeaderValues_(summary) {
    const row = summary || {};
    return {
      ...MolProblemService.practiceLevelMetrics_(row),
      updatedAt: row.updatedAt,
      courseId: row.courseId,
      courseName: row.courseName,
      rosterKey: row.rosterKey,
      studentId: row.studentId,
      '出席番号': row.number,
      '氏名': row.name,
      totalAttempts: row.totalAttempts,
      totalCorrect: row.totalCorrect,
      totalAccuracy: row.totalAccuracy,
      recent10Attempts: row.recent10Attempts,
      recent10Correct: row.recent10Correct,
      recent10Accuracy: row.recent10Accuracy,
      beginnerAttempts: row.beginnerAttempts,
      beginnerCorrect: row.beginnerCorrect || 0,
      beginnerAccuracy: row.beginnerAccuracy || 0,
      intermediateAttempts: row.intermediateAttempts,
      intermediateCorrect: row.intermediateCorrect || 0,
      intermediateAccuracy: row.intermediateAccuracy || 0,
      advancedAttempts: row.advancedAttempts,
      advancedCorrect: row.advancedCorrect || 0,
      advancedAccuracy: row.advancedAccuracy || 0,
      recent10BeginnerAttempts: row.recent10BeginnerAttempts || 0,
      recent10IntermediateAttempts: row.recent10IntermediateAttempts || 0,
      recent10AdvancedAttempts: row.recent10AdvancedAttempts || 0,
      lastAnsweredAt: row.lastAnsweredAt || '',
      lastLevel: row.lastLevel || '',
      lastProblemType: row.lastProblemType || '',
      averageElapsedMs: row.averageElapsedMs || 0,
      medianElapsedMs: row.medianElapsedMs || 0,
      recent10AverageElapsedMs: row.recent10AverageElapsedMs || 0,
      recent10MedianElapsedMs: row.recent10MedianElapsedMs || 0,
      correctAverageElapsedMs: row.correctAverageElapsedMs || 0,
      correctRecent10AverageElapsedMs: row.correctRecent10AverageElapsedMs || 0,
      first10AverageElapsedMs: row.first10AverageElapsedMs || 0,
      speedImprovementRate: row.speedImprovementRate || 0,
      lastElapsedMs: row.lastElapsedMs || 0
    };
  }

  static readProblemTypeStatsRows() {
    const sheet = this.getManagedSheet_('問題タイプ別キャッシュ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => this.problemTypeStatsObjectToRow_(this.rowValuesToObject_(headerMap, row)))
      .filter((row) => row.rosterKey !== '' && row.level !== '' && row.problemType !== '');
  }

  static readProblemTypeStatsForRosterKey(rosterKey) {
    const normalizedRosterKey = this.toString_(rosterKey);
    if (normalizedRosterKey === '') {
      return [];
    }
    return this.findObjectsByHeaderValue_('問題タイプ別キャッシュ', 'rosterKey', normalizedRosterKey, { matchCase: true })
      .map((row) => this.problemTypeStatsObjectToRow_(row))
      .filter((row) => row.rosterKey === normalizedRosterKey);
  }

  static findProblemTypeStatsRow(rosterKey, level, problemType) {
    const rowIndex = this.findProblemTypeStatsRowIndex_(rosterKey, level, problemType);
    if (!rowIndex) {
      return null;
    }
    return this.problemTypeStatsObjectToRow_(this.readObjectAtRow_('問題タイプ別キャッシュ', rowIndex) || {});
  }

  static upsertProblemTypeStatsRow(row) {
    const normalizedRosterKey = this.toString_(row && row.rosterKey);
    const normalizedLevel = this.toString_(row && row.level);
    const normalizedProblemType = this.toString_(row && row.problemType);
    if (normalizedRosterKey === '' || normalizedLevel === '' || normalizedProblemType === '') {
      throw new Error('問題タイプ別キャッシュ更新対象のrosterKey/level/problemTypeが空です。');
    }
    const valuesByHeader = this.problemTypeStatsRowToHeaderValues_(row);
    const rowIndex = this.findProblemTypeStatsRowIndex_(normalizedRosterKey, normalizedLevel, normalizedProblemType);
    if (rowIndex) {
      this.updateObjectRowByHeaders_('問題タイプ別キャッシュ', rowIndex, valuesByHeader);
      return;
    }
    this.appendObjectRow_('問題タイプ別キャッシュ', valuesByHeader);
  }

  static writeProblemTypeStatsRows(rows) {
    const sheet = this.getManagedSheet_('問題タイプ別キャッシュ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const headers = this.getSheetDefinition_('問題タイプ別キャッシュ').headers;
    const values = (rows || []).map((row) => [
      row.updatedAt,
      row.courseId,
      row.courseName,
      row.rosterKey,
      row.studentId,
      row.number,
      row.name,
      row.level,
      row.problemType,
      row.attempts,
      row.correct,
      row.accuracy,
      row.recentAttempts,
      row.recentCorrect,
      row.recentAccuracy,
      row.averageElapsedMs || 0,
      row.elapsedCount || 0,
      row.recentAverageElapsedMs || 0,
      row.lastAnsweredAt || '',
      row.lastIsCorrect === true,
      row.lastElapsedMs || 0
    ]);
    this.writeRowsByHeaders_(sheet, headerMap, headers, values);
  }

  static findProblemTypeStatsRowIndex_(rosterKey, level, problemType) {
    const normalizedRosterKey = this.toString_(rosterKey);
    const normalizedLevel = this.toString_(level);
    const normalizedProblemType = this.toString_(problemType);
    if (normalizedRosterKey === '' || normalizedLevel === '' || normalizedProblemType === '') {
      return 0;
    }
    const sheet = this.getManagedSheet_('問題タイプ別キャッシュ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const rosterColumn = headerMap.rosterKey;
    const lastRow = sheet.getLastRow();
    if (!rosterColumn || lastRow < 2) {
      return 0;
    }
    const searchRange = sheet.getRange(2, rosterColumn, lastRow - 1, 1);
    const finder = searchRange.createTextFinder(normalizedRosterKey);
    if (finder.matchEntireCell) {
      finder.matchEntireCell(true);
    }
    if (finder.matchCase) {
      finder.matchCase(true);
    }
    const seenRows = {};
    for (let count = 0; count < lastRow - 1; count += 1) {
      const found = finder.findNext();
      if (!found || !found.getRow) {
        break;
      }
      const rowIndex = found.getRow();
      if (seenRows[rowIndex]) {
        break;
      }
      seenRows[rowIndex] = true;
      const row = this.problemTypeStatsObjectToRow_(this.readObjectAtRow_('問題タイプ別キャッシュ', rowIndex) || {});
      if (row.rosterKey === normalizedRosterKey && row.level === normalizedLevel && row.problemType === normalizedProblemType) {
        return rowIndex;
      }
    }
    return 0;
  }

  static problemTypeStatsObjectToRow_(row) {
    const source = row || {};
    return {
      updatedAt: this.toString_(source.updatedAt),
      courseId: this.toString_(source.courseId),
      courseName: this.toString_(source.courseName),
      rosterKey: this.toString_(source.rosterKey),
      studentId: this.toString_(source.studentId),
      number: this.toString_(source['出席番号'] != null ? source['出席番号'] : source.number),
      name: this.toString_(source['氏名'] != null ? source['氏名'] : source.name),
      level: this.toString_(source.level),
      problemType: this.toString_(source.problemType),
      attempts: Number(source.attempts || 0),
      correct: Number(source.correct || 0),
      accuracy: Number(source.accuracy || 0),
      recentAttempts: Number(source.recentAttempts || 0),
      recentCorrect: Number(source.recentCorrect || 0),
      recentAccuracy: Number(source.recentAccuracy || 0),
      averageElapsedMs: Number(source.averageElapsedMs || 0),
      elapsedCount: Number(source.elapsedCount || 0),
      recentAverageElapsedMs: Number(source.recentAverageElapsedMs || 0),
      lastAnsweredAt: this.toString_(source.lastAnsweredAt),
      lastIsCorrect: source.lastIsCorrect === true || this.toString_(source.lastIsCorrect).toLowerCase() === 'true',
      lastElapsedMs: Number(source.lastElapsedMs || 0)
    };
  }

  static problemTypeStatsRowToHeaderValues_(row) {
    const source = row || {};
    return {
      updatedAt: source.updatedAt,
      courseId: source.courseId,
      courseName: source.courseName,
      rosterKey: source.rosterKey,
      studentId: source.studentId,
      '出席番号': source.number,
      '氏名': source.name,
      level: source.level,
      problemType: source.problemType,
      attempts: source.attempts || 0,
      correct: source.correct || 0,
      accuracy: source.accuracy || 0,
      recentAttempts: source.recentAttempts || 0,
      recentCorrect: source.recentCorrect || 0,
      recentAccuracy: source.recentAccuracy || 0,
      averageElapsedMs: source.averageElapsedMs || 0,
      elapsedCount: source.elapsedCount || 0,
      recentAverageElapsedMs: source.recentAverageElapsedMs || 0,
      lastAnsweredAt: source.lastAnsweredAt || '',
      lastIsCorrect: source.lastIsCorrect === true,
      lastElapsedMs: source.lastElapsedMs || 0
    };
  }

  static readMonitorCacheRow(key) {
    const normalizedKey = this.toString_(key);
    if (normalizedKey === '') {
      return null;
    }
    const sheet = this.getManagedSheetWithoutSchemaCheck_('モニターキャッシュ');
    const rowIndex = this.findRowIndexByHeaderValueInSheet_(sheet, 'key', normalizedKey, { matchCase: true });
    if (!rowIndex) {
      return null;
    }
    return this.monitorCacheObjectToRow_(this.readObjectAtRowFromSheet_(sheet, rowIndex) || {});
  }

  static upsertMonitorCacheRow(row) {
    const normalizedKey = this.toString_(row && row.key);
    if (normalizedKey === '') {
      throw new Error('モニターキャッシュ更新対象のkeyが空です。');
    }
    const valuesByHeader = this.monitorCacheRowToHeaderValues_(row);
    const rowIndex = this.findRowIndexByHeaderValue_('モニターキャッシュ', 'key', normalizedKey, { matchCase: true });
    if (rowIndex) {
      this.updateObjectRowByHeaders_('モニターキャッシュ', rowIndex, valuesByHeader);
      return;
    }
    this.appendObjectRow_('モニターキャッシュ', valuesByHeader);
  }

  static monitorCacheObjectToRow_(row) {
    const source = row || {};
    return {
      key: this.toString_(source.key),
      json: this.toString_(source.json),
      updatedAt: this.toString_(source.updatedAt),
      note: this.toString_(source.note)
    };
  }

  static monitorCacheRowToHeaderValues_(row) {
    const source = row || {};
    return {
      key: this.toString_(source.key),
      json: this.toString_(source.json),
      updatedAt: this.toString_(source.updatedAt),
      note: this.toString_(source.note)
    };
  }

  static appendDistributionLogs(logs) {
    if (!Array.isArray(logs) || logs.length === 0) {
      return;
    }
    const sheet = this.getManagedSheet_('配付ログ');
    const rows = logs.map((log) => [
      log.timestamp,
      log.runId,
      log.courseId,
      log.rosterKey,
      log.studentId,
      log.token,
      log.studentUrl,
      log.classroomAnnouncementId,
      log.status,
      log.errorMessage
    ]);
    this.appendRows_(sheet, rows);
  }

  static readDistributionLogs() {
    const sheet = this.getManagedSheet_('配付ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => this.distributionLogObjectToRow_(this.rowValuesToObject_(headerMap, row)))
      .filter((row) => row.token !== '' || row.rosterKey !== '');
  }

  static readLatestDistributionLogs(limit) {
    return this.readLatestRowsAsObjects_('配付ログ', limit)
      .map((row) => this.distributionLogObjectToRow_(row))
      .filter((row) => row.token !== '' || row.rosterKey !== '');
  }

  static readDistributionStatusRows() {
    const sheet = this.getManagedSheet_('配付ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const headers = ['rosterKey', 'token', 'status'];
    if (headers.some((header) => !headerMap[header])) {
      return [];
    }
    const count = lastRow - 1;
    const valuesByHeader = {};
    for (const header of headers) {
      valuesByHeader[header] = sheet.getRange(2, headerMap[header], count, 1).getValues();
    }
    return Array.from({ length: count }, (_, index) => ({
      rosterKey: this.toString_(valuesByHeader.rosterKey[index][0]),
      token: this.toString_(valuesByHeader.token[index][0]),
      status: this.toString_(valuesByHeader.status[index][0])
    })).filter((row) => row.token !== '' || row.rosterKey !== '');
  }

  static distributionLogObjectToRow_(row) {
    const source = row || {};
    return {
      timestamp: this.toString_(source.timestamp),
      runId: this.toString_(source.runId),
      courseId: this.toString_(source.courseId),
      rosterKey: this.toString_(source.rosterKey),
      studentId: this.toString_(source.studentId),
      token: this.toString_(source.token),
      studentUrl: this.toString_(source.studentUrl),
      classroomAnnouncementId: this.toString_(source.classroomAnnouncementId),
      status: this.toString_(source.status),
      errorMessage: this.toString_(source.errorMessage)
    };
  }

  static appendRunLog(log) {
    const sheet = this.getManagedSheet_('実行ログ');
    this.appendRows_(sheet, [[
      log.runId,
      log.operation,
      log.startedAt,
      log.finishedAt,
      Number(log.processedCount || 0),
      Number(log.successCount || 0),
      Number(log.errorCount || 0),
      Number(log.skippedCount || 0),
      log.nextAction || 'DONE'
    ]]);
  }

  static readRunLogs() {
    const sheet = this.getManagedSheet_('実行ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => this.runLogObjectToRow_(this.rowValuesToObject_(headerMap, row)))
      .filter((row) => row.runId !== '');
  }

  static readLatestRunLogs(limit) {
    return this.readLatestRowsAsObjects_('実行ログ', limit)
      .map((row) => this.runLogObjectToRow_(row))
      .filter((row) => row.runId !== '');
  }

  static runLogObjectToRow_(row) {
    const source = row || {};
    return {
      runId: this.toString_(source.runId),
      operation: this.toString_(source.operation),
      startedAt: this.toString_(source.startedAt),
      finishedAt: this.toString_(source.finishedAt),
      processedCount: Number(source.processedCount || 0),
      successCount: Number(source.successCount || 0),
      errorCount: Number(source.errorCount || 0),
      skippedCount: Number(source.skippedCount || 0),
      nextAction: this.toString_(source.nextAction)
    };
  }

  static withDocumentLock(callback) {
    // Web apps may have no document lock. Student writes and teacher actions
    // share the script lock so buffered rows are visible before another writer.
    if (typeof LockService === 'undefined' || !LockService.getScriptLock) return callback();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      return callback();
    } finally {
      try {
        if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.flush) SpreadsheetApp.flush();
      } finally {
        lock.releaseLock();
      }
    }
  }

  static getSettingValue(key) {
    return this.getSettingValue_(key);
  }

  static getSettingValues(keys) {
    const requestedKeys = Array.from(new Set((keys || []).map((key) => this.toString_(key)).filter((key) => key !== '')));
    const result = {};
    requestedKeys.forEach((key) => {
      result[key] = '';
    });
    if (requestedKeys.length === 0) {
      return result;
    }
    try {
      const keySet = new Set(requestedKeys);
      const sheet = this.getManagedSheetWithoutSchemaCheck_('設定');
      const headerMap = this.getHeaderColumnMap_(sheet);
      const rows = this.getBodyValues_(sheet);
      for (const row of rows) {
        const key = this.toString_(row[headerMap['キー'] - 1]);
        if (keySet.has(key)) {
          result[key] = this.toString_(row[headerMap['値'] - 1]);
        }
      }
    } catch (_ignored) {
      // Missing settings should fall back to defaults in the caller.
    }
    return result;
  }

  static setSettingValue(key, value, description) {
    this.setSettingValues_([{ key, value, description: description || '' }]);
  }

  static getSettingValue_(key) {
    try {
      const sheet = this.getManagedSheetWithoutSchemaCheck_('設定');
      const headerMap = this.getHeaderColumnMap_(sheet);
      const rows = this.getBodyValues_(sheet);
      for (const row of rows) {
        if (this.toString_(row[headerMap['キー'] - 1]) === key) {
          return this.toString_(row[headerMap['値'] - 1]);
        }
      }
    } catch (_ignored) {
      return '';
    }
    return '';
  }

  static setSettingValues_(settings) {
    const sheet = this.getManagedSheetWithoutSchemaCheck_('設定');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const rows = this.getBodyValues_(sheet);
    const now = this.nowIso_();
    const rowByKey = new Map();
    rows.forEach((row, index) => {
      rowByKey.set(this.toString_(row[headerMap['キー'] - 1]), { row, index });
    });
    for (const setting of settings) {
      const key = this.toString_(setting.key);
      if (key === '') {
        continue;
      }
      const existing = rowByKey.get(key);
      if (existing) {
        existing.row[headerMap['値'] - 1] = this.toString_(setting.value);
        existing.row[headerMap['説明'] - 1] = this.toString_(setting.description);
        existing.row[headerMap['更新日時'] - 1] = now;
      } else {
        rows.push([key, this.toString_(setting.value), this.toString_(setting.description), now]);
      }
    }
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('設定').headers, rows);
    try {
      if (typeof MolProblemService !== 'undefined' && MolProblemService.clearLevelSettingCache_) {
        MolProblemService.clearLevelSettingCache_();
      }
    } catch (_ignored) {
      // Cache invalidation is best-effort; settings remain the source of truth.
    }
  }

  static ensureSheet_(spreadsheet, definition) {
    return spreadsheet.getSheetByName(definition.name) || spreadsheet.insertSheet(definition.name);
  }

  static clearSheetForReinitialization_(sheet) {
    if (sheet && typeof sheet.clear === 'function') {
      sheet.clear();
    } else if (sheet && sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) {
      sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).clearContent();
    }
    this.invalidateHeaderColumnMap_(sheet);
  }

  static initializeSheet_(sheet, definition) {
    this.appendMissingHeaders_(sheet, definition.headers);
    this.formatSheet_(sheet, definition);
    this.applyCheckboxes_(sheet, definition);
    this.applyDropdownValidations_(sheet, definition);
    if (definition.name === '設定') {
      this.seedDefaultSettings_(sheet);
    }
  }

  static appendMissingHeaders_(sheet, headers) {
    const existingMap = this.getHeaderColumnMap_(sheet);
    const existingHeaderCount = Math.max(sheet.getLastColumn(), 0);
    const nextHeaders = [];
    for (const header of headers) {
      if (!existingMap[header]) {
        nextHeaders.push(header);
      }
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      this.invalidateHeaderColumnMap_(sheet);
      return;
    }
    if (nextHeaders.length > 0) {
      sheet.getRange(1, existingHeaderCount + 1, 1, nextHeaders.length).setValues([nextHeaders]);
      this.invalidateHeaderColumnMap_(sheet);
    }
  }

  static formatSheet_(sheet, definition) {
    if (sheet.getLastColumn() > 0) {
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#e8f0fe');
    }
    const headerMap = this.getHeaderColumnMap_(sheet);
    for (const column of definition.columnWidths || []) {
      if (headerMap[column.header]) {
        sheet.setColumnWidth(headerMap[column.header], column.width);
      }
    }
  }

  static applyCheckboxes_(sheet, definition) {
    const headerMap = this.getHeaderColumnMap_(sheet);
    for (const header of definition.checkboxHeaders || []) {
      if (headerMap[header]) {
        const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
        sheet.getRange(2, headerMap[header], maxRows, 1).insertCheckboxes();
      }
    }
  }

  static applyDropdownValidations_(sheet, definition) {
    const headerMap = this.getHeaderColumnMap_(sheet);
    for (const validation of definition.dropdownValidations || []) {
      if (!headerMap[validation.header] || typeof SpreadsheetApp === 'undefined') {
        continue;
      }
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(validation.values, true).setAllowInvalid(false).build();
      const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
      sheet.getRange(2, headerMap[validation.header], maxRows, 1).setDataValidation(rule);
    }
  }

  static seedDefaultSettings_(sheet) {
    const headerMap = this.getHeaderColumnMap_(sheet);
    const rows = this.getBodyValues_(sheet).filter((row) => {
      const key = this.toString_(row[headerMap['キー'] - 1]);
      return key !== 'AVOGADRO_CONSTANT' && key !== 'DEFAULT_TOLERANCE';
    });
    const defaultsByKey = new Map(MOL_DRILL_DEFAULT_SETTINGS.map((setting) => [setting.key, setting]));
    const existing = new Set();
    const now = this.nowIso_();
    rows.forEach((row) => {
      const key = this.toString_(row[headerMap['キー'] - 1]);
      existing.add(key);
      const defaultSetting = defaultsByKey.get(key);
      if (defaultSetting) {
        row[headerMap['説明'] - 1] = defaultSetting.description || '';
      }
    });
    const additions = MOL_DRILL_DEFAULT_SETTINGS
      .filter((setting) => !existing.has(setting.key))
      .map((setting) => [setting.key, setting.value || '', setting.description || '', now]);
    if (additions.length > 0) {
      rows.push(...additions);
    }
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('設定').headers, rows);
  }

  static getManagedSheet_(name) {
    this.assertManagementSheetsReady();
    return this.getManagedSheetWithoutSchemaCheck_(name);
  }

  static getStudentRuntimeSheet_(name) {
    return this.getManagedSheetWithoutSchemaCheck_(name);
  }

  static getManagedSheetWithoutSchemaCheck_(name) {
    const definition = this.getSheetDefinition_(name);
    const cache = this.getManagedSheetCache_();
    if (cache[definition.name]) {
      return cache[definition.name];
    }
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(definition.name);
    if (!sheet) {
      throw new Error(`管理シートが見つかりません: ${definition.name}`);
    }
    cache[definition.name] = sheet;
    return sheet;
  }

  static getSheetDefinition_(name) {
    const definition = MOL_DRILL_SHEETS.find((item) => item.name === name);
    if (!definition) {
      throw new Error(`未知の管理シートです: ${name}`);
    }
    return definition;
  }

  static getHeaderColumnMap_(sheet) {
    if (!sheet) return {};
    const cacheKey = this.getSheetCacheKey_(sheet);
    const cache = this.getHeaderColumnMapCache_();
    if (cacheKey && cache[cacheKey]) {
      return cache[cacheKey];
    }
    if (sheet.getLastColumn() < 1 || sheet.getLastRow() < 1) return {};
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = {};
    headers.forEach((header, index) => {
      const key = this.toString_(header);
      if (key !== '') {
        map[key] = index + 1;
      }
    });
    if (cacheKey) {
      cache[cacheKey] = map;
    }
    return map;
  }

  static findRowIndexByHeaderValue_(sheetName, headerName, value, options) {
    const sheet = this.getManagedSheet_(sheetName);
    return this.findRowIndexByHeaderValueInSheet_(sheet, headerName, value, options);
  }

  static findRowIndexByHeaderValueInSheet_(sheet, headerName, value, options) {
    const headerMap = this.getHeaderColumnMap_(sheet);
    const column = headerMap[headerName];
    const lastRow = sheet.getLastRow();
    const normalizedValue = this.toString_(value);
    if (!column || lastRow < 2 || normalizedValue === '') {
      return 0;
    }
    const searchRange = sheet.getRange(2, column, lastRow - 1, 1);
    const finder = searchRange.createTextFinder(normalizedValue);
    const exact = !options || options.exact !== false;
    if (finder.matchEntireCell) {
      finder.matchEntireCell(exact);
    }
    if (finder.matchCase) {
      finder.matchCase(options && options.matchCase === true);
    }
    const found = finder.findNext();
    return found && found.getRow ? found.getRow() : 0;
  }

  static findObjectsByHeaderValue_(sheetName, headerName, value, options) {
    const sheet = this.getManagedSheet_(sheetName);
    return this.findObjectsByHeaderValueInSheet_(sheet, headerName, value, options);
  }

  static findObjectsByHeaderValueInSheet_(sheet, headerName, value, options) {
    const headerMap = this.getHeaderColumnMap_(sheet);
    const column = headerMap[headerName];
    const lastRow = sheet.getLastRow();
    const normalizedValue = this.toString_(value);
    if (!column || lastRow < 2 || normalizedValue === '') {
      return [];
    }
    const searchRange = sheet.getRange(2, column, lastRow - 1, 1);
    const finder = searchRange.createTextFinder(normalizedValue);
    const exact = !options || options.exact !== false;
    if (finder.matchEntireCell) {
      finder.matchEntireCell(exact);
    }
    if (finder.matchCase) {
      finder.matchCase(options && options.matchCase === true);
    }
    // Search once, then retrieve nearby matches in bounded blocks. Reading each
    // row separately also repeats header/size RPCs and makes cold starts slow.
    const indices=Array.from(new Set(finder.findAll().map(cell=>cell.getRow())))
      .filter(index=>index>=2 && index<=lastRow).sort((a,b)=>a-b);
    const rows=[];
    const lastColumn=sheet.getLastColumn();
    let offset=0;
    while(offset<indices.length) {
      const start=indices[offset];
      let endOffset=offset;
      while(endOffset+1<indices.length && indices[endOffset+1]-start<500) endOffset+=1;
      const values=sheet.getRange(start,1,indices[endOffset]-start+1,lastColumn).getValues();
      for(let index=offset;index<=endOffset;index+=1) {
        rows.push(this.rowValuesToObject_(headerMap,values[indices[index]-start]));
      }
      offset=endOffset+1;
    }
    return rows;
  }

  static readObjectAtRow_(sheetName, rowIndex) {
    const sheet = this.getManagedSheet_(sheetName);
    return this.readObjectAtRowFromSheet_(sheet, rowIndex);
  }

  static readObjectAtRowFromSheet_(sheet, rowIndex) {
    const lastColumn = sheet.getLastColumn();
    if (rowIndex < 2 || rowIndex > sheet.getLastRow() || lastColumn < 1) {
      return null;
    }
    const headerMap = this.getHeaderColumnMap_(sheet);
    const values = sheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
    return this.rowValuesToObject_(headerMap, values);
  }

  static updateCellByHeader_(sheetName, rowIndex, headerName, value) {
    const sheet = this.getManagedSheet_(sheetName);
    const headerMap = this.getHeaderColumnMap_(sheet);
    const column = headerMap[headerName];
    if (!column || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
      return false;
    }
    sheet.getRange(rowIndex, column).setValue(value);
    return true;
  }

  static updateObjectRowByHeaders_(sheetName, rowIndex, valuesByHeader) {
    const sheet = this.getManagedSheet_(sheetName);
    const headerMap = this.getHeaderColumnMap_(sheet);
    const width = Math.max(sheet.getLastColumn(), 1);
    if (rowIndex < 2 || rowIndex > sheet.getLastRow()) {
      return false;
    }
    const row = sheet.getRange(rowIndex, 1, 1, width).getValues()[0];
    const values = valuesByHeader || {};
    Object.keys(values).forEach((header) => {
      if (headerMap[header]) {
        row[headerMap[header] - 1] = values[header];
      }
    });
    sheet.getRange(rowIndex, 1, 1, width).setValues([row]);
    return true;
  }

  static appendObjectRow_(sheetName, valuesByHeader) {
    const sheet = this.getManagedSheet_(sheetName);
    const headerMap = this.getHeaderColumnMap_(sheet);
    const width = Math.max(sheet.getLastColumn(), 1);
    const row = new Array(width).fill('');
    const values = valuesByHeader || {};
    Object.keys(values).forEach((header) => {
      if (headerMap[header]) {
        row[headerMap[header] - 1] = values[header];
      }
    });
    const appendedRowIndex = Math.max(sheet.getLastRow() + 1, 2);
    this.appendRows_(sheet, [row]);
    return appendedRowIndex;
  }

  static readLatestRowsAsObjects_(sheetName, limit) {
    const numericLimit = Number(limit || 0);
    const normalizedLimit = Number.isFinite(numericLimit) ? Math.max(0, Math.floor(numericLimit)) : 0;
    if (normalizedLimit <= 0) {
      return [];
    }
    const sheet = this.getManagedSheet_(sheetName);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) {
      return [];
    }
    const count = Math.min(normalizedLimit, lastRow - 1);
    const startRow = lastRow - count + 1;
    const headerMap = this.getHeaderColumnMap_(sheet);
    // 管理画面のログ確認は最新分だけでよいので、末尾行だけを読む。
    return sheet.getRange(startRow, 1, count, lastColumn)
      .getValues()
      .map((row) => this.rowValuesToObject_(headerMap, row));
  }

  static rowValuesToObject_(headerMap, row) {
    const object = {};
    Object.keys(headerMap).forEach((header) => {
      object[header] = row[headerMap[header] - 1];
    });
    return object;
  }

  static getBodyValues_(sheet) {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) {
      return [];
    }
    return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  }

  static writeCourseRows_(rows) {
    const sheet = this.getManagedSheet_('Classroom一覧');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const values = rows.map((row) => [
      row.courseId,
      row.name,
      row.section,
      row.teacherFolderId,
      row.courseState,
      this.formatCourseSyncValue_(row.checked === true)
    ]);
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('Classroom一覧').headers, values);
  }

  static writeStudentRows_(rows) {
    const sheet = this.getManagedSheet_('生徒名簿');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const values = rows.map((row) => [
      row.courseId,
      row.courseName,
      row.rosterKey,
      row.studentId,
      row.number,
      row.name,
      row.email,
      row.status
    ]);
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('生徒名簿').headers, values);
  }

  static writeRowsByHeaders_(sheet, headerMap, headers, rows) {
    const width = Math.max(sheet.getLastColumn(), headers.length);
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, width).clearContent();
    }
    if (rows.length === 0) {
      return;
    }
    const outputRows = rows.map((sourceRow) => {
      if (Array.isArray(sourceRow) && sourceRow.length === width) {
        return sourceRow;
      }
      const row = new Array(width).fill('');
      headers.forEach((header, index) => {
        if (headerMap[header]) {
          row[headerMap[header] - 1] = Array.isArray(sourceRow) ? sourceRow[index] : sourceRow[header];
        }
      });
      return row;
    });
    if (sheet.getMaxRows() < outputRows.length + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), outputRows.length + 1 - sheet.getMaxRows());
    }
    sheet.getRange(2, 1, outputRows.length, width).setValues(outputRows);
  }

  static appendRows_(sheet, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }
    const width = Math.max(sheet.getLastColumn(), rows[0].length);
    const startRow = Math.max(sheet.getLastRow() + 1, 2);
    if (sheet.getMaxRows() < startRow + rows.length - 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), startRow + rows.length - 1 - sheet.getMaxRows());
    }
    const outputRows = rows.map((row) => {
      const output = new Array(width).fill('');
      for (let index = 0; index < Math.min(width, row.length); index += 1) {
        output[index] = row[index];
      }
      return output;
    });
    sheet.getRange(startRow, 1, outputRows.length, width).setValues(outputRows);
  }

  static createBlankRow_(sheet) {
    return new Array(Math.max(sheet.getLastColumn(), 1)).fill('');
  }

  static formatManagementSheetStatusMessage_(status) {
    const parts = [];
    if (status.missingSheets.length > 0) {
      parts.push(`不足シート: ${status.missingSheets.join(', ')}`);
    }
    for (const item of status.missingHeadersBySheet) {
      parts.push(`${item.sheetName} シートに必要なヘッダーがありません: ${item.headers.join(', ')}`);
    }
    const detail = parts.join('\n') || '管理シートの構成を確認できません。';
    return `${detail}\nスプレッドシートの「もるくえ！」メニューから「管理シートを作成・補修」を実行してください。`;
  }

  static nowIso_() {
    return new Date().toISOString();
  }

  static toString_(value) {
    return String(value == null ? '' : value).trim();
  }

  static isFlagEnabled_(value) {
    if (value === true) {
      return true;
    }
    const normalized = this.toString_(value).toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === '済';
  }

  static isRequestFlag_(value) {
    if (value === true) {
      return true;
    }
    const normalized = this.toString_(value).toLowerCase();
    return normalized === '1' || normalized === 'true';
  }

  static formatFlagValue_(enabled) {
    return enabled === true ? '1' : '';
  }

  static formatCompletedFlagValue_(enabled) {
    return enabled === true ? '済' : '';
  }

  static formatRequestFlagValue_(enabled) {
    return enabled === true ? '1' : '';
  }

  static normalizePostDeletionStatus_(value) {
    const normalized = this.toString_(value);
    return ['済', '失敗', '対象なし'].includes(normalized) ? normalized : '';
  }

  static formatPostDeletionValue_(row) {
    const status = this.normalizePostDeletionStatus_(row && row.postDeletionStatus);
    if (status !== '') {
      return status;
    }
    return this.formatRequestFlagValue_(this.isRequestFlag_(row && row.postDeletionRequested));
  }

  static isCourseSyncEnabled_(value) {
    return this.isFlagEnabled_(value);
  }

  static formatCourseSyncValue_(enabled) {
    return this.formatFlagValue_(enabled);
  }
}

class ClassroomService {
  static listTeacherCourses() {
    const courses = [];
    let pageToken;
    do {
      const request = {
        teacherId: 'me',
        courseStates: ['ACTIVE'],
        pageSize: 100
      };
      if (pageToken) {
        request.pageToken = pageToken;
      }
      const response = Classroom.Courses.list(request);
      for (const course of response.courses || []) {
        if ((course.courseState || '') !== 'ACTIVE') {
          continue;
        }
        courses.push({
          courseId: course.id || '',
          name: course.name || '',
          section: course.section || '',
          teacherFolderId: course.teacherFolder && course.teacherFolder.id ? course.teacherFolder.id : '',
          courseState: course.courseState || 'ACTIVE'
        });
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
    return courses.sort((a, b) => `${a.name} ${a.section}`.localeCompare(`${b.name} ${b.section}`, 'ja'));
  }

  static listStudents(courseId) {
    const normalizedCourseId = String(courseId || '').trim();
    if (normalizedCourseId === '') {
      throw new Error('生徒名簿を取得する courseId が空です。');
    }
    const students = [];
    let pageToken;
    do {
      const request = { pageSize: 100 };
      if (pageToken) {
        request.pageToken = pageToken;
      }
      const response = Classroom.Courses.Students.list(normalizedCourseId, request);
      for (const student of response.students || []) {
        const profile = student.profile || {};
        const name = profile.name || {};
        students.push({
          courseId: normalizedCourseId,
          studentId: profile.id || student.userId || '',
          displayName: name.fullName || [name.familyName, name.givenName].filter(Boolean).join(' '),
          emailAddress: profile.emailAddress || ''
        });
      }
      pageToken = response.nextPageToken;
    } while (pageToken);
    return students.sort((a, b) => `${a.displayName} ${a.studentId}`.localeCompare(`${b.displayName} ${b.studentId}`, 'ja'));
  }

  static createStudentUrlAnnouncement(courseId, studentId, text) {
    const normalizedCourseId = String(courseId || '').trim();
    const normalizedStudentId = String(studentId || '').trim();
    const normalizedText = String(text || '').trim();
    if (normalizedCourseId === '' || normalizedStudentId === '' || normalizedText === '') {
      throw new Error('Classroomお知らせ作成に必要な courseId/studentId/text が空です。');
    }
    const resource = {
      text: normalizedText,
      assigneeMode: 'INDIVIDUAL_STUDENTS',
      individualStudentsOptions: {
        studentIds: [normalizedStudentId]
      },
      state: 'PUBLISHED'
    };
    return Classroom.Courses.Announcements.create(resource, normalizedCourseId);
  }

  static deleteStudentUrlAnnouncement(courseId, announcementId) {
    const normalizedCourseId = String(courseId || '').trim();
    const normalizedAnnouncementId = String(announcementId || '').trim();
    if (normalizedCourseId === '' || normalizedAnnouncementId === '') {
      throw new Error('Classroomお知らせ削除に必要な courseId/announcementId が空です。');
    }
    return Classroom.Courses.Announcements.remove(normalizedCourseId, normalizedAnnouncementId);
  }
}

class TokenService {
  static createRosterKey(courseId, studentId) {
    const normalizedCourseId = String(courseId || '').trim();
    const normalizedStudentId = String(studentId || '').trim();
    return normalizedCourseId === '' || normalizedStudentId === '' ? '' : `${normalizedCourseId}::${normalizedStudentId}`;
  }

  static isTeacherTestStudentRosterKey(rosterKey) {
    const key=String(rosterKey || '').trim();
    return key === MOL_DRILL_TEACHER_TEST_STUDENT.rosterKey || key.startsWith('__TEST_LOAD__::');
  }

  static generateToken() {
    const uuid = typeof Utilities !== 'undefined' && Utilities.getUuid ? Utilities.getUuid() : String(Math.random()).slice(2);
    return `mdl_${String(uuid).replace(/[^A-Za-z0-9]/g, '')}`;
  }

  static buildStudentUrl(baseUrl, token) {
    const normalizedBaseUrl = String(baseUrl || '').trim();
    const normalizedToken = encodeURIComponent(String(token || '').trim());
    if (normalizedBaseUrl === '') {
      throw new Error('WEB_APP_URL が空です。設定シートにWebアプリURLを入力してください。');
    }
    const separator = normalizedBaseUrl.indexOf('?') === -1 ? '?' : '&';
    return `${normalizedBaseUrl}${separator}t=${normalizedToken}`;
  }

  static buildTokenRowsForStudents(students, existingRows, baseUrl, issuedAt, tokenFactory) {
    const existingByRosterKey = new Map((existingRows || []).map((row) => [String(row.rosterKey || ''), row]));
    const createToken = typeof tokenFactory === 'function' ? tokenFactory : () => this.generateToken();
    return (students || [])
      .filter((student) => String(student.status || '在籍') !== '退籍')
      .map((student) => {
        const courseId = String(student.courseId || '').trim();
        const studentId = String(student.studentId || '').trim();
        const rosterKey = String(student.rosterKey || this.createRosterKey(courseId, studentId)).trim();
        const existing = existingByRosterKey.get(rosterKey);
        const reuseExisting = existing && !SheetRepository.isFlagEnabled_(existing.revoked) && String(existing.token || '').trim() !== '';
        const existingPostDeletionRequested = reuseExisting && SheetRepository.isRequestFlag_(
          existing.postDeletionRequested != null ? existing.postDeletionRequested : existing['投稿削除']
        );
        const existingPostDeletionStatus = reuseExisting && !existingPostDeletionRequested
          ? SheetRepository.normalizePostDeletionStatus_(existing.postDeletionStatus != null ? existing.postDeletionStatus : existing['投稿削除'])
          : '';
        const token = reuseExisting ? String(existing.token).trim() : createToken(student);
        return {
          token,
          courseId,
          courseName: String(student.courseName || '').trim(),
          rosterKey,
          studentId,
          number: String(student.number || '').trim(),
          name: String(student.name || student.displayName || '').trim(),
          email: String(student.email || student.emailAddress || '').trim(),
          studentUrl: this.buildStudentUrl(baseUrl, token),
          issuedAt: reuseExisting ? String(existing.issuedAt || issuedAt).trim() : issuedAt,
          lastAccessedAt: reuseExisting ? String(existing.lastAccessedAt || '').trim() : '',
          revoked: false,
          postDeletionRequested: reuseExisting ? existingPostDeletionRequested : false,
          postDeletionStatus: reuseExisting ? existingPostDeletionStatus : '',
          note: reuseExisting ? String(existing.note || '').trim() : ''
        };
      });
  }

  static ensureTeacherTestStudentToken(baseUrl) {
    SheetRepository.assertManagementSheetsReady();
    const normalizedBaseUrl = String(baseUrl || '').trim();
    const issuedAt = new Date().toISOString();
    const existingRows = SheetRepository.readTokenRows();
    const existing = existingRows.find((row) => row.rosterKey === MOL_DRILL_TEACHER_TEST_STUDENT.rosterKey) || null;
    const reuseExisting = existing && !SheetRepository.isFlagEnabled_(existing.revoked) && String(existing.token || '').trim() !== '';
    const token = reuseExisting ? String(existing.token).trim() : this.generateToken();
    const note = this.ensureTeacherTestStudentNote_(reuseExisting ? existing.note : '');
    const testRow = {
      token,
      courseId: MOL_DRILL_TEACHER_TEST_STUDENT.courseId,
      courseName: MOL_DRILL_TEACHER_TEST_STUDENT.courseName,
      rosterKey: MOL_DRILL_TEACHER_TEST_STUDENT.rosterKey,
      studentId: MOL_DRILL_TEACHER_TEST_STUDENT.studentId,
      number: MOL_DRILL_TEACHER_TEST_STUDENT.number,
      name: MOL_DRILL_TEACHER_TEST_STUDENT.name,
      email: MOL_DRILL_TEACHER_TEST_STUDENT.email,
      studentUrl: this.buildStudentUrl(normalizedBaseUrl, token),
      issuedAt: reuseExisting ? String(existing.issuedAt || issuedAt).trim() : issuedAt,
      lastAccessedAt: reuseExisting ? String(existing.lastAccessedAt || '').trim() : '',
      revoked: false,
      postDeletionRequested: false,
      postDeletionStatus: '',
      note
    };
    const preservedRows = existingRows.filter((row) => row.rosterKey !== MOL_DRILL_TEACHER_TEST_STUDENT.rosterKey);
    SheetRepository.writeTokenRows([...preservedRows, testRow]);
    this.clearTokenRowCachesForRows_([existing, testRow]);
    return testRow;
  }

  static ensureTeacherTestStudentNote_(current) {
    const existing = String(current || '').trim();
    const required = MOL_DRILL_TEACHER_TEST_STUDENT.note;
    if (existing === '') {
      return required;
    }
    return existing.includes(required) ? existing : this.appendNote_(existing, required);
  }

  static reissueTokenRowsForRosterKey(rows, rosterKey, baseUrl, issuedAt, tokenFactory) {
    const normalizedRosterKey = String(rosterKey || '').trim();
    if (normalizedRosterKey === '') {
      throw new Error('再発行するrosterKeyが空です。');
    }
    const createToken = typeof tokenFactory === 'function' ? tokenFactory : () => this.generateToken();
    let updated = null;
    const nextRows = (rows || []).map((row) => {
      if (String(row.rosterKey || '').trim() !== normalizedRosterKey) {
        return { ...row };
      }
      const token = createToken(row);
      updated = {
        ...row,
        token,
        studentUrl: this.buildStudentUrl(baseUrl, token),
        issuedAt,
        lastAccessedAt: '',
        revoked: false,
        postDeletionRequested: false,
        postDeletionStatus: '',
        note: this.appendNote_(row.note, `再発行 ${issuedAt}`)
      };
      return updated;
    });
    if (!updated) {
      throw new Error(`再発行対象のトークンが見つかりません: ${normalizedRosterKey}`);
    }
    return { rows: nextRows, updated };
  }

  static revokeTokenRowsForRosterKey(rows, rosterKey, revokedAt) {
    const normalizedRosterKey = String(rosterKey || '').trim();
    if (normalizedRosterKey === '') {
      throw new Error('無効化するrosterKeyが空です。');
    }
    let updated = null;
    const nextRows = (rows || []).map((row) => {
      if (String(row.rosterKey || '').trim() !== normalizedRosterKey) {
        return { ...row };
      }
      updated = {
        ...row,
        revoked: true,
        note: this.appendNote_(row.note, `無効化 ${revokedAt}`)
      };
      return updated;
    });
    if (!updated) {
      throw new Error(`無効化対象のトークンが見つかりません: ${normalizedRosterKey}`);
    }
    return { rows: nextRows, updated };
  }

  static issueTokensForCheckedCourses(options) {
    SheetRepository.assertManagementSheetsReady();
    const baseUrl = this.resolveStudentWebAppUrl_(options && options.baseUrl);
    const issuedAt = new Date().toISOString();
    const students = SheetRepository.getStudentsForCheckedCourses();
    const existingRows = SheetRepository.readTokenRows();
    const touchedKeys = new Set(students.map((student) => student.rosterKey));
    const preservedRows = existingRows.filter((row) => !touchedKeys.has(row.rosterKey));
    const issuedRows = this.buildTokenRowsForStudents(students, existingRows, baseUrl, issuedAt);
    SheetRepository.writeTokenRows([...preservedRows, ...issuedRows]);
    this.clearTokenRowCachesForRows_([
      ...existingRows.filter((row) => touchedKeys.has(row.rosterKey)),
      ...issuedRows
    ]);
    return {
      issued: issuedRows.length,
      rows: issuedRows
    };
  }

  static issueTokensForActiveStudents(options) {
    SheetRepository.assertManagementSheetsReady();
    const baseUrl = this.resolveStudentWebAppUrl_(options && options.baseUrl);
    const issuedAt = new Date().toISOString();
    const students = SheetRepository.getActiveStudents();
    const existingRows = SheetRepository.readTokenRows();
    const touchedKeys = new Set(students.map((student) => student.rosterKey));
    const preservedRows = existingRows.filter((row) => !touchedKeys.has(row.rosterKey));
    const issuedRows = this.buildTokenRowsForStudents(students, existingRows, baseUrl, issuedAt);
    SheetRepository.writeTokenRows([...preservedRows, ...issuedRows]);
    this.clearTokenRowCachesForRows_([
      ...existingRows.filter((row) => touchedKeys.has(row.rosterKey)),
      ...issuedRows
    ]);
    return {
      issued: issuedRows.length,
      rows: issuedRows
    };
  }

  static reissueStudentToken(rosterKey, options) {
    SheetRepository.assertManagementSheetsReady();
    const baseUrl = this.resolveStudentWebAppUrl_(options && options.baseUrl);
    const rows = SheetRepository.readTokenRows();
    const result = this.reissueTokenRowsForRosterKey(rows, rosterKey, baseUrl, new Date().toISOString());
    SheetRepository.writeTokenRows(result.rows);
    this.clearTokenRowCachesForRows_([
      ...rows.filter((row) => String(row.rosterKey || '').trim() === String(rosterKey || '').trim()),
      result.updated
    ]);
    return result.updated;
  }

  static revokeStudentToken(rosterKey) {
    SheetRepository.assertManagementSheetsReady();
    const rows = SheetRepository.readTokenRows();
    const result = this.revokeTokenRowsForRosterKey(rows, rosterKey, new Date().toISOString());
    SheetRepository.writeTokenRows(result.rows);
    this.clearTokenRowCachesForRows_([
      ...rows.filter((row) => String(row.rosterKey || '').trim() === String(rosterKey || '').trim()),
      result.updated
    ]);
    return result.updated;
  }

  static validateTokenAgainstRows(token, rows) {
    const normalizedToken = String(token || '').trim();
    if (normalizedToken === '') {
      throw new Error('tokenが空です。');
    }
    const tokenRow = (rows || []).find((row) => String(row.token || '').trim() === normalizedToken) || null;
    if (!tokenRow) {
      throw new Error('tokenが見つかりません。');
    }
    if (SheetRepository.isFlagEnabled_(tokenRow.revoked)) {
      throw new Error('このtokenは無効化されています。');
    }
    if (String(tokenRow.rosterKey || '').trim() === '') {
      throw new Error('tokenに対応するrosterKeyが空です。');
    }
    if(String(tokenRow.rosterKey).startsWith('__TEST_LOAD__::') && !(Date.now()-Date.parse(tokenRow.issuedAt)<2*60*60*1000)) throw new Error('測定用URLの期限が切れています。');
    return tokenRow;
  }

  static findTokenForValidation_(token, timings) {
    const normalizedToken = String(token || '').trim();
    if (normalizedToken === '') {
      return null;
    }
    const metrics = timings || {};
    const cacheReadStartedAtMs = Date.now();
    const cached = this.readTokenRowCache_(normalizedToken);
    metrics.tokenCacheReadElapsedMs = (metrics.tokenCacheReadElapsedMs || 0) + (Date.now() - cacheReadStartedAtMs);
    if (cached) {
      return cached;
    }
    const sheetFindStartedAtMs = Date.now();
    const tokenRow = SheetRepository.findToken(normalizedToken);
    metrics.tokenSheetFindElapsedMs = (metrics.tokenSheetFindElapsedMs || 0) + (Date.now() - sheetFindStartedAtMs);
    if (tokenRow) {
      const cacheWriteStartedAtMs = Date.now();
      this.writeTokenRowCache_(tokenRow);
      metrics.tokenCacheWriteElapsedMs = (metrics.tokenCacheWriteElapsedMs || 0) + (Date.now() - cacheWriteStartedAtMs);
    }
    return tokenRow;
  }

  static readTokenRowCache_(token) {
    const cache = this.getTokenRowCache_();
    if (!cache || typeof cache.get !== 'function') {
      return null;
    }
    const normalizedToken = String(token || '').trim();
    try {
      const raw = cache.get(this.createTokenRowCacheKey_(normalizedToken));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || String(parsed.token || '').trim() !== normalizedToken) {
        return null;
      }
      return parsed;
    } catch (_ignored) {
      return null;
    }
  }

  static writeTokenRowCache_(tokenRow) {
    const cache = this.getTokenRowCache_();
    if (!cache || typeof cache.put !== 'function') {
      return;
    }
    const normalizedToken = String(tokenRow && tokenRow.token || '').trim();
    if (normalizedToken === '') {
      return;
    }
    try {
      cache.put(this.createTokenRowCacheKey_(normalizedToken), JSON.stringify(tokenRow), MOL_DRILL_TOKEN_ROW_CACHE_TTL_SECONDS);
    } catch (_ignored) {
      // token cache is a short-lived optimization; validation must still work without it.
    }
  }

  static clearTokenRowCache_(token) {
    const cache = this.getTokenRowCache_();
    const normalizedToken = String(token || '').trim();
    if (!cache || normalizedToken === '') {
      return;
    }
    try {
      const key = this.createTokenRowCacheKey_(normalizedToken);
      if (typeof cache.remove === 'function') {
        cache.remove(key);
      } else if (typeof cache.put === 'function') {
        cache.put(key, '', 1);
      }
    } catch (_ignored) {
      // Best effort: stale entries expire quickly.
    }
  }

  static clearTokenRowCachesForRows_(rows) {
    const seen = new Set();
    for (const row of rows || []) {
      const token = String(row && row.token || '').trim();
      if (token === '' || seen.has(token)) {
        continue;
      }
      seen.add(token);
      this.clearTokenRowCache_(token);
    }
  }

  static createTokenRowCacheKey_(token) {
    return `tokenRowCache:${this.hashCacheKey_(`${String(token || '').trim()}|token-row-v1`)}`;
  }

  static hashCacheKey_(text) {
    let hash = 2166136261;
    const source = String(text || '');
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  static getTokenRowCache_() {
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        return CacheService.getScriptCache();
      }
    } catch (_ignored) {
      return null;
    }
    return null;
  }

  static validateToken(token, timings) {
    const normalizedToken = String(token || '').trim();
    if (normalizedToken === '') {
      throw new Error('tokenが空です。');
    }
    const tokenRow = this.findTokenForValidation_(normalizedToken, timings || {});
    return this.validateTokenAgainstRows(normalizedToken, tokenRow ? [tokenRow] : []);
  }

  static resolveStudentWebAppUrl_(overrideUrl) {
    const override = String(overrideUrl || '').trim();
    if (override !== '') {
      return override;
    }
    const configured = SheetRepository.getSettingValue('WEB_APP_URL');
    if (configured !== '') {
      return configured;
    }
    const legacyConfigured = SheetRepository.getSettingValue('studentWebAppUrl');
    if (legacyConfigured !== '') {
      return legacyConfigured;
    }
    try {
      const serviceUrl = ScriptApp.getService().getUrl();
      if (serviceUrl) {
        return serviceUrl;
      }
    } catch (_ignored) {
      // Fall through to explicit error in buildStudentUrl.
    }
    return '';
  }

  static appendNote_(current, addition) {
    const existing = String(current || '').trim();
    const next = String(addition || '').trim();
    if (existing === '') {
      return next;
    }
    if (next === '') {
      return existing;
    }
    return `${existing}; ${next}`;
  }
}

class MolProblemService {
  static isPracticeLevel_(level) { return /^lv[1-6]$/.test(String(level)); }
  static needsSignificantDigits_(level) { return ['advanced', 'lv5', 'lv6'].includes(level); }
  static practiceGroups_(level) {
    return ['lv1', 'lv2', 'lv5'].includes(level)
      ? { mol_mass: [1, 2], mol_particles: [3, 4], mol_volume: [5, 6] }
      : { mass_particles: [7, 8], mass_volume: [9, 10], volume_particles: [11, 12] };
  }
  static practiceLevelMetrics_(row) {
    const out = {};
    for (const level of ['lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6']) {
      for (const suffix of ['Attempts', 'Correct', 'Accuracy']) out[level + suffix] = Number((row || {})[level + suffix] || 0);
    }
    return out;
  }
  static countSignificantDigits_(input) {
    const text = String(input).normalize('NFKC').trim().replace(/×/g, 'x').replace(/\s+/g, '');
    const match = text.match(/^[+]?((?:\d+(?:\.\d*)?|\.\d+))(?:(?:e|[x*]10\^)[+-]?\d+)?$/i);
    return match ? match[1].replace('.', '').replace(/^0+/, '').length : 0;
  }
  static strictPracticeGrade_(input, expected, level) {
    const text = String(input).normalize('NFKC').trim().replace(/×/g, 'x').replace(/\s+/g, '');
    const valid = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:(?:e|[x*]10\^)[+-]?\d+)?$/i.test(text);
    const value = valid ? this.normalizeNumericInput(text) : NaN;
    const target = Number(expected);
    const hard = this.needsSignificantDigits_(level);
    const compared = hard ? this.roundToSignificantDigits(value, 3) : value;
    const numericCorrect = Number.isFinite(value) && value > 0 && Math.abs(compared - target) <= Math.abs(target) * 1e-12;
    const precisionCorrect = !hard || this.countSignificantDigits_(text) === 3;
    return { isCorrect: numericCorrect && precisionCorrect,
      acceptedAnswerType: numericCorrect && !precisionCorrect ? 'precision' : numericCorrect ? 'exact' : '',
      acceptedAnswer: numericCorrect ? value : '', exactAnswer: target,
      normalizedSubmittedAnswer: Number.isFinite(value) ? value : '' };
  }

  static generateProblem(levelOrOptions) {
    const options = typeof levelOrOptions === 'object' && levelOrOptions !== null ? levelOrOptions : { level: levelOrOptions };
    const level = this.normalizeLevel_(options.level);
    if (this.isPracticeLevel_(level)) {
      const groups = this.practiceGroups_(level);
      const focused = ['lv1', 'lv3'].includes(level);
      const category = focused ? (options.category || Object.keys(groups)[0]) : '';
      if (focused && !groups[category]) throw new Error('選択した変換はこのレベルでは使えません。');
      const profile = this.getLevelProfile_(level);
      if (focused) profile.typeIds = groups[category];
      const problem = this.generateLevelProblem_(profile, {});
      problem.category = category;
      return problem;
    }
    if (level === 'intermediate') {
      return this.generateIntermediateProblem(options);
    }
    if (level === 'advanced') {
      return this.generateAdvancedProblem(options);
    }
    return this.generateBeginnerProblem(options);
  }

  static generateBeginnerProblem(options) {
    return this.generateLevelProblem_(this.getLevelProfile_('beginner'), options || {});
  }

  static generateIntermediateProblem(options) {
    return this.generateLevelProblem_(this.getLevelProfile_('intermediate'), options || {});
  }

  static generateAdvancedProblem(options) {
    return this.generateLevelProblem_(this.getLevelProfile_('advanced'), options || {});
  }

  static generateLevelProblem_(profile, options) {
    const typeId = this.resolveProblemTypeId_(options.problemType, profile.typeIds);
    const type = this.getProblemTypeById_(typeId);
    const problem = this.createProblemByType_(type, profile);
    problem.explanation = this.buildExplanation(problem);
    problem.problemHash = this.createProblemHash_(problem);
    problem.problemId = `MP_${problem.problemHash}`;
    problem.attemptId = this.createAttemptId_();
    return problem;
  }

  static issueProblemForToken(token, levelOrOptions) {
    const options = typeof levelOrOptions === 'object' && levelOrOptions !== null ? levelOrOptions : { level: levelOrOptions };
    const problem = this.generateProblem(options);
    this.storeProblemForToken(token, problem);
    return {
      publicProblem: this.toPublicProblem(problem),
      problem
    };
  }

  static toPublicProblem(problem) {
    return {
      problemId: problem.problemId,
      attemptId: problem.attemptId,
      level: problem.level,
      problemType: problem.problemType,
      problemTypeId: problem.problemTypeId,
      category: problem.category || '',
      questionText: problem.questionText,
      questionHtml: this.formatChemicalTextHtml_(problem.questionText, [problem.substance && problem.substance.formula]),
      givenValuesTitle: this.getGivenValuesTitle_(problem),
      givenValues: this.toPublicGivenValues_(problem.givenValues),
      unit: problem.unit,
      inputHint: this.createInputHint_(problem)
    };
  }

  static formatChemicalFormulaHtml(formula) {
    const text = String(formula == null ? '' : formula);
    if (!/^(?:[A-Z][a-z]?\d*)+$/.test(text)) {
      return this.escapeHtml_(text);
    }
    return text.replace(/(\d+)/g, '<sub>$1</sub>');
  }

  static formatChemicalTextHtml_(text, extraFormulas) {
    const source = String(text == null ? '' : text);
    const formulas = this.getChemicalFormulaDisplayTokens_(extraFormulas);
    if (source === '' || formulas.length === 0) {
      return this.escapeHtml_(source);
    }
    let output = '';
    let plainStart = 0;
    let index = 0;
    while (index < source.length) {
      const matched = formulas.find((formula) => source.slice(index, index + formula.length) === formula);
      if (!matched) {
        index += 1;
        continue;
      }
      output += this.escapeHtml_(source.slice(plainStart, index));
      output += this.formatChemicalFormulaHtml(matched);
      index += matched.length;
      plainStart = index;
    }
    output += this.escapeHtml_(source.slice(plainStart));
    return output;
  }

  static getChemicalFormulaDisplayTokens_(extraFormulas) {
    const formulas = []
      .concat((extraFormulas || []).map((formula) => String(formula || '')))
      .concat(this.getSubstances_().map((substance) => substance.formula))
      .filter((formula) => /\d/.test(formula) && /^(?:[A-Z][a-z]?\d*)+$/.test(formula));
    return Array.from(new Set(formulas)).sort((a, b) => b.length - a.length);
  }

  static escapeHtml_(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static storeProblemForToken(token, problem) {
    if (String(problem.attemptId || '').trim() === '') {
      problem.attemptId = this.createAttemptId_();
    }
    if (String(problem.problemHash || '').trim() === '') {
      problem.problemHash = this.createProblemHash_(problem);
    }
    if (String(problem.problemId || '').trim() === '') {
      problem.problemId = `MP_${problem.problemHash}`;
    }
    const key = this.createStoredProblemKey_(token, problem.attemptId);
    const payload = JSON.stringify(problem);
    this.getMemoryProblemStore_()[key] = payload;
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        CacheService.getScriptCache().put(key, payload, 60 * 30);
      }
    } catch (_ignored) {
      // In-memory fallback is enough for local tests and same-runtime retries.
    }
  }

  static getStoredProblemForToken(token, attemptId) {
    const normalizedAttemptId = String(attemptId || '').trim();
    if (normalizedAttemptId === '') {
      throw new Error('問題データが見つかりません。新しい問題を取得してください。');
    }
    const key = this.createStoredProblemKey_(token, normalizedAttemptId);
    let payload = this.getMemoryProblemStore_()[key] || '';
    if (payload === '') {
      try {
        if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
          payload = CacheService.getScriptCache().get(key) || '';
        }
      } catch (_ignored) {
        payload = '';
      }
    }
    if (payload === '') {
      throw new Error('問題データが見つかりません。新しい問題を取得してください。');
    }
    const problem = JSON.parse(payload);
    if (String(problem.attemptId || '').trim() !== normalizedAttemptId) {
      throw new Error('保存済み問題データの試行IDを確認できません。新しい問題を取得してください。');
    }
    if (!this.verifyProblemIntegrity(problem)) {
      throw new Error('保存済み問題データの整合性を確認できません。新しい問題を取得してください。');
    }
    return problem;
  }

  static createStoredProblemKey_(token, attemptId) {
    return `molProblem:${this.hashString_(`${String(token || '').trim()}::${String(attemptId || '').trim()}`)}`;
  }

  static getMemoryProblemStore_() {
    const root = typeof globalThis !== 'undefined' ? globalThis : this;
    if (!root.__MOL_DRILL_PROBLEM_STORE) {
      root.__MOL_DRILL_PROBLEM_STORE = {};
    }
    return root.__MOL_DRILL_PROBLEM_STORE;
  }

  static createProblemByType_(type, profile) {
    const avogadroConstant = profile.avogadroConstant;
    const molarVolume = 22.4;
    const substance = this.isPracticeLevel_(profile.level) && !this.needsSignificantDigits_(profile.level)
      ? this.pickNumber_(this.getSubstances_().filter(item => (!type.requiresGasAtSTP || item.isGasAtSTP) && [2, 16, 18, 28, 32, 44, 100].includes(item.molarMass)))
      : this.pickSubstance_(type.requiresGasAtSTP === true);
    const mol = this.pickNumber_(type.advancedOnly === true ? profile.advancedMolValues : profile.molValues);
    const mass = mol * substance.molarMass;
    const particles = mol * avogadroConstant;
    const gasVolume = mol * molarVolume;
    const significantDigits = profile.significantDigits;
    const tolerance = profile.tolerance;
    let questionText = '';
    let expectedAnswer = 0;
    let unit = '';
    let given = {};

    if (type.key === 'mol_to_mass') {
      expectedAnswer = mass;
      unit = 'g';
      given = { value: this.roundForProblem_(mol, profile), unit: 'mol' };
      questionText = `${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} mol は何 g ですか。`;
    } else if (type.key === 'mass_to_mol') {
      expectedAnswer = mol;
      unit = 'mol';
      given = { value: this.roundForProblem_(mass, profile), unit: 'g' };
      questionText = `${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} g は何 mol ですか。`;
    } else if (type.key === 'mol_to_particles') {
      expectedAnswer = particles;
      unit = '個';
      given = { value: this.roundForProblem_(mol, profile), unit: 'mol' };
      questionText = `${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} mol に含まれる粒子数は何個ですか。`;
    } else if (type.key === 'particles_to_mol') {
      expectedAnswer = mol;
      unit = 'mol';
      given = { value: (this.isPracticeLevel_(profile.level) && !this.needsSignificantDigits_(profile.level) ? particles : this.roundToSignificantDigits(particles, significantDigits)), unit: '個' };
      questionText = `${substance.name} ${substance.formula} ${this.formatScientific_(given.value, significantDigits)} 個は何 mol ですか。`;
    } else if (type.key === 'mol_to_gas_volume') {
      expectedAnswer = gasVolume;
      unit = 'L';
      given = { value: this.roundForProblem_(mol, profile), unit: 'mol' };
      questionText = `標準状態で ${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} mol の体積は何 L ですか。`;
    } else if (type.key === 'gas_volume_to_mol') {
      expectedAnswer = mol;
      unit = 'mol';
      given = { value: this.roundForProblem_(gasVolume, profile), unit: 'L' };
      questionText = `標準状態で ${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} L は何 mol ですか。`;
    } else if (type.key === 'mass_to_particles') {
      expectedAnswer = particles;
      unit = '個';
      given = { value: this.roundForProblem_(mass, profile), unit: 'g' };
      questionText = `${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} g に含まれる粒子数は何個ですか。`;
    } else if (type.key === 'particles_to_mass') {
      expectedAnswer = mass;
      unit = 'g';
      given = { value: (this.isPracticeLevel_(profile.level) && !this.needsSignificantDigits_(profile.level) ? particles : this.roundToSignificantDigits(particles, significantDigits)), unit: '個' };
      questionText = `${substance.name} ${substance.formula} ${this.formatScientific_(given.value, significantDigits)} 個の質量は何 g ですか。`;
    } else if (type.key === 'mass_to_gas_volume') {
      expectedAnswer = gasVolume;
      unit = 'L';
      given = { value: this.roundForProblem_(mass, profile), unit: 'g' };
      questionText = `標準状態で ${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} g の体積は何 L ですか。`;
    } else if (type.key === 'gas_volume_to_mass') {
      expectedAnswer = mass;
      unit = 'g';
      given = { value: this.roundForProblem_(gasVolume, profile), unit: 'L' };
      questionText = `標準状態で ${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} L の質量は何 g ですか。`;
    } else if (type.key === 'gas_volume_to_particles') {
      expectedAnswer = particles;
      unit = '個';
      given = { value: this.roundForProblem_(gasVolume, profile), unit: 'L' };
      questionText = `標準状態で ${substance.name} ${substance.formula} ${this.formatPlain_(given.value)} L に含まれる粒子数は何個ですか。`;
    } else if (type.key === 'particles_to_gas_volume') {
      expectedAnswer = gasVolume;
      unit = 'L';
      given = { value: (this.isPracticeLevel_(profile.level) && !this.needsSignificantDigits_(profile.level) ? particles : this.roundToSignificantDigits(particles, significantDigits)), unit: '個' };
      questionText = `${substance.name} ${substance.formula} ${this.formatScientific_(given.value, significantDigits)} 個は、標準状態で何 L ですか。`;
    } else if (type.key === 'atomic_mass_to_atom_mass') {
      const element = this.pickElement_();
      expectedAnswer = element.atomicMass / avogadroConstant;
      unit = 'g';
      given = { value: element.atomicMass, unit: 'g/mol' };
      questionText = `原子量 ${this.formatPlain_(element.atomicMass)} の ${element.name} ${element.formula} 原子1粒の質量は何 g ですか。`;
      return this.finalizeProblem_(profile, type, questionText, {
        formula: element.formula,
        name: element.name,
        molarMass: element.atomicMass,
        isGasAtSTP: element.isGasAtSTP,
        type: element.type,
        atomicMass: element.atomicMass
      }, given, expectedAnswer, unit);
    } else if (type.key === 'mass_to_molar_mass_estimate') {
      const estimateMode = this.pickNumber_(['mol', 'particles', 'gasVolume']);
      const estimateSubstance = estimateMode === 'gasVolume' ? this.pickSubstance_(true) : substance;
      const estimateMol = this.pickNumber_(profile.advancedMolValues);
      const estimateParticles = estimateMol * avogadroConstant;
      const estimateVolume = estimateMol * molarVolume;
      const estimateMass = estimateMol * estimateSubstance.molarMass;
      expectedAnswer = estimateSubstance.molarMass;
      unit = 'g/mol';
      given = {
        value: this.roundToSignificantDigits(estimateMass, significantDigits),
        unit: 'g',
        amountMode: estimateMode
      };
      if (estimateMode === 'mol') {
        given.secondaryValue = this.roundForProblem_(estimateMol, profile);
        given.secondaryUnit = 'mol';
        questionText = `未知物質X ${this.formatPlain_(given.value)} g は ${this.formatPlain_(given.secondaryValue)} mol です。Xの分子量・式量を推定してください。`;
      } else if (estimateMode === 'gasVolume') {
        given.secondaryValue = this.roundToSignificantDigits(estimateVolume, significantDigits);
        given.secondaryUnit = 'L';
        questionText = `標準状態で未知気体X ${this.formatPlain_(given.secondaryValue)} L の質量は ${this.formatPlain_(given.value)} g です。Xの分子量を推定してください。`;
      } else {
        given.secondaryValue = this.roundToSignificantDigits(estimateParticles, significantDigits);
        given.secondaryUnit = '個';
        questionText = `未知物質X ${this.formatPlain_(given.value)} g に ${this.formatScientific_(given.secondaryValue, significantDigits)} 個の粒子が含まれます。Xの分子量・式量を推定してください。`;
      }
      return this.finalizeProblem_(profile, type, questionText, {
        formula: 'X',
        name: estimateMode === 'gasVolume' ? '未知気体X' : '未知物質X',
        molarMass: estimateSubstance.molarMass,
        isGasAtSTP: estimateMode === 'gasVolume',
        type: estimateMode === 'gasVolume' ? 'unknown-gas' : 'unknown'
      }, given, expectedAnswer, unit);
    } else {
      throw new Error(`未対応の問題タイプです: ${type.key}`);
    }

    return this.finalizeProblem_(profile, type, questionText, substance, given, expectedAnswer, unit);
  }

  static finalizeProblem_(profile, type, questionText, substance, given, expectedAnswer, unit) {
    if (this.isPracticeLevel_(profile.level)) {
      const amount = given.unit === 'mol' ? given.value : given.unit === 'g' ? given.value / substance.molarMass
        : given.unit === 'L' ? given.value / 22.4 : given.value / profile.avogadroConstant;
      expectedAnswer = unit === 'mol' ? amount : unit === 'g' ? amount * substance.molarMass
        : unit === 'L' ? amount * 22.4 : amount * profile.avogadroConstant;
    }
    if (this.isPracticeLevel_(profile.level)) questionText = questionText.replace('標準状態', '標準状態（0 ℃・1 atm）');
    const rawExpected = this.normalizeExactExpectedAnswer_(expectedAnswer);
    const roundedExpected = this.roundToSignificantDigits(rawExpected, profile.significantDigits);
    const storedExpected = this.getExpectedAnswerForLevel_(rawExpected, roundedExpected, profile.level);
    const problem = {
      problemId: '',
      attemptId: '',
      level: profile.level,
      problemType: type.key,
      problemTypeId: type.id,
      questionText,
      substance: {
        formula: substance.formula,
        name: substance.name,
        molarMass: substance.molarMass,
        isGasAtSTP: substance.isGasAtSTP === true,
        type: substance.type || 'compound'
      },
      given,
      rawExpectedAnswer: rawExpected,
      expectedAnswer: storedExpected,
      displayAnswer: this.formatExpectedAnswerForDisplay_(storedExpected, profile),
      unit,
      tolerance: profile.tolerance,
      significantDigits: profile.significantDigits,
      avogadroConstant: profile.avogadroConstant,
      molarVolume: 22.4,
      requiresRounding: this.needsSignificantDigits_(profile.level) && this.requiresRounding_(expectedAnswer, roundedExpected),
      explanation: ''
    };
    problem.givenValues = this.buildGivenValues_(problem, profile);
    problem.givenValuesTitle = this.getGivenValuesTitle_(problem);
    return problem;
  }

  static getExpectedAnswerForLevel_(rawExpected, roundedExpected, level) {
    return this.needsSignificantDigits_(this.normalizeLevel_(level)) ? roundedExpected : Number(rawExpected);
  }

  static normalizeExactExpectedAnswer_(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      return numeric;
    }
    const magnitude = Math.abs(numeric);
    if (magnitude >= 1e12 || magnitude < 1e-9) {
      return Number(numeric.toPrecision(15));
    }
    return Number(numeric.toFixed(12));
  }

  static formatExpectedAnswerForDisplay_(expectedAnswer, profile) {
    if (this.needsSignificantDigits_(this.normalizeLevel_(profile && profile.level))) {
      return this.formatNumberForDisplay_(expectedAnswer, profile && profile.significantDigits);
    }
    return this.formatPlain_(expectedAnswer);
  }

  static buildGivenValues_(problem, profile) {
    const requiredValues = this.buildRequiredGivenValues_(problem);
    if (profile.level !== 'advanced') {
      return requiredValues;
    }
    return this.addAdvancedDummyGivenValues_(requiredValues, problem);
  }

  static buildRequiredGivenValues_(problem) {
    const type = String(problem.problemType || '');
    if (type === 'mol_to_mass' || type === 'mass_to_mol') {
      return [this.createMolarMassGivenValue_(problem.substance, true)];
    }
    if (type === 'mol_to_particles' || type === 'particles_to_mol') {
      return [this.createAvogadroGivenValue_(problem, true)];
    }
    if (type === 'mol_to_gas_volume' || type === 'gas_volume_to_mol') {
      return [this.createMolarVolumeGivenValue_(problem, true)];
    }
    if (type === 'mass_to_particles') {
      return [
        this.createMolarMassGivenValue_(problem.substance, true),
        this.createAvogadroGivenValue_(problem, true)
      ];
    }
    if (type === 'particles_to_mass') {
      return [
        this.createAvogadroGivenValue_(problem, true),
        this.createMolarMassGivenValue_(problem.substance, true)
      ];
    }
    if (type === 'mass_to_gas_volume') {
      return [
        this.createMolarMassGivenValue_(problem.substance, true),
        this.createMolarVolumeGivenValue_(problem, true)
      ];
    }
    if (type === 'gas_volume_to_mass') {
      return [
        this.createMolarVolumeGivenValue_(problem, true),
        this.createMolarMassGivenValue_(problem.substance, true)
      ];
    }
    if (type === 'gas_volume_to_particles') {
      return [
        this.createMolarVolumeGivenValue_(problem, true),
        this.createAvogadroGivenValue_(problem, true)
      ];
    }
    if (type === 'particles_to_gas_volume') {
      return [
        this.createAvogadroGivenValue_(problem, true),
        this.createMolarVolumeGivenValue_(problem, true)
      ];
    }
    if (type === 'atomic_mass_to_atom_mass') {
      return [
        this.createAtomicMassGivenValue_(problem.substance, true),
        this.createAvogadroGivenValue_(problem, true)
      ];
    }
    if (type === 'mass_to_molar_mass_estimate') {
      return this.createMolarMassEstimateGivenValues_(problem);
    }
    return [];
  }

  static createMolarMassEstimateGivenValues_(problem) {
    const given = problem.given || {};
    const digits = Number(problem.significantDigits || 3);
    const values = [
      {
        label: 'X の質量',
        value: `${this.formatNumberForDisplay_(given.value, digits)} g`,
        isRequired: true
      }
    ];
    if (given.amountMode === 'mol') {
      values.push({
        label: 'X の物質量',
        value: `${this.formatNumberForDisplay_(given.secondaryValue, digits)} mol`,
        isRequired: true
      });
    } else if (given.amountMode === 'gasVolume') {
      values.push({
        label: 'X の標準状態体積',
        value: `${this.formatNumberForDisplay_(given.secondaryValue, digits)} L`,
        isRequired: true
      });
      values.push(this.createMolarVolumeGivenValue_(problem, true));
    } else {
      values.push({
        label: 'X の粒子数',
        value: `${this.formatScientific_(given.secondaryValue, digits)} 個`,
        isRequired: true
      });
      values.push(this.createAvogadroGivenValue_(problem, true));
    }
    return values;
  }

  static addAdvancedDummyGivenValues_(requiredValues, problem) {
    const values = requiredValues.slice();
    const candidates = this.createDummyGivenValueCandidates_(problem);
    const seen = new Set(values.map((item) => `${item.label}:${item.value}`));
    const dummyTargetCount = Number(problem.problemTypeId || 0) % 2 === 0 ? 2 : 1;
    for (const candidate of candidates) {
      const key = `${candidate.label}:${candidate.value}`;
      if (seen.has(key)) {
        continue;
      }
      values.push(candidate);
      seen.add(key);
      if (values.filter((item) => item.isRequired === false).length >= dummyTargetCount) {
        break;
      }
    }
    return values;
  }

  static createDummyGivenValueCandidates_(problem) {
    const candidates = [];
    const requiredKeys = new Set((problem.givenValues || []).filter((item) => item.isRequired === true).map((item) => item.label));
    const substance = problem.substance || {};
    if (substance.formula && substance.formula !== 'X' && substance.type !== 'element' && !requiredKeys.has(this.createMolarMassLabel_(substance))) {
      candidates.push(this.createMolarMassGivenValue_(substance, false));
    }
    if (!requiredKeys.has('アボガドロ定数')) {
      candidates.push(this.createAvogadroGivenValue_(problem, false));
    }
    if (!requiredKeys.has('標準状態のモル体積')) {
      candidates.push(this.createMolarVolumeGivenValue_(problem, false));
    }
    return candidates;
  }

  static createMolarMassGivenValue_(substance, isRequired) {
    return {
      label: this.createMolarMassLabel_(substance || {}),
      value: `${this.formatNumberForDisplay_(substance && substance.molarMass, 3)} g/mol`,
      isRequired: isRequired === true
    };
  }

  static createMolarMassLabel_(substance) {
    const formula = substance && substance.formula ? substance.formula : '物質';
    if (substance && substance.type === 'ionic') {
      return `${formula} の式量`;
    }
    return `${formula} のモル質量`;
  }

  static createAtomicMassGivenValue_(substance, isRequired) {
    const formula = substance && substance.formula ? substance.formula : '原子';
    return {
      label: `${formula} の原子量`,
      value: `${this.formatNumberForDisplay_(substance && substance.molarMass, 3)} g/mol`,
      isRequired: isRequired === true
    };
  }

  static createAvogadroGivenValue_(problem, isRequired) {
    return {
      label: 'アボガドロ定数',
      value: `${this.formatScientific_(problem.avogadroConstant, problem.significantDigits)} /mol`,
      isRequired: isRequired === true
    };
  }

  static createMolarVolumeGivenValue_(problem, isRequired) {
    return {
      label: '標準状態のモル体積',
      value: `${this.formatNumberForDisplay_(problem.molarVolume || 22.4, 3)} L/mol`,
      isRequired: isRequired === true
    };
  }

  static getGivenValuesTitle_(problem) {
    const values = Array.isArray(problem && problem.givenValues) ? problem.givenValues : [];
    return values.some((item) => item.isRequired === false) ? '与えられた値' : 'この問題で使う値';
  }

  static toPublicGivenValues_(givenValues) {
    return (Array.isArray(givenValues) ? givenValues : []).map((item) => ({
      label: String(item.label || ''),
      labelHtml: this.formatChemicalTextHtml_(item.label),
      value: String(item.value || ''),
      valueHtml: this.formatChemicalTextHtml_(item.value)
    }));
  }

  static normalizeNumericInput(input) {
    let text = String(input == null ? '' : input).trim();
    if (text === '') {
      return NaN;
    }
    text = text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
    text = text
      .replace(/．/g, '.')
      .replace(/－/g, '-')
      .replace(/＋/g, '+')
      .replace(/，/g, ',')
      .replace(/×/g, 'x')
      .replace(/＾/g, '^')
      .replace(/\s+/g, '')
      .replace(/,/g, '');
    text = text.replace(/([+-]?(?:\d+(?:\.\d*)?|\.\d+))x10\^([+-]?\d+)/i, '$1e$2');
    text = text.replace(/([+-]?(?:\d+(?:\.\d*)?|\.\d+))\*10\^([+-]?\d+)/i, '$1e$2');
    const value = Number(text);
    return Number.isFinite(value) ? value : NaN;
  }

  static roundToSignificantDigits(value, digits) {
    const numeric = Number(value);
    const normalizedDigits = Math.max(1, Math.floor(Number(digits) || 1));
    if (!Number.isFinite(numeric) || numeric === 0) {
      return Number.isFinite(numeric) ? numeric : NaN;
    }
    const exponent = Math.floor(Math.log10(Math.abs(numeric)));
    const factor = Math.pow(10, normalizedDigits - 1 - exponent);
    if (!Number.isFinite(factor) || factor === 0) {
      const precise = Number(numeric.toPrecision(normalizedDigits));
      return Object.is(precise, -0) ? 0 : precise;
    }
    const scaled = numeric * factor;
    const scaledEpsilon = Math.sign(scaled) * Number.EPSILON * Math.max(1, Math.abs(scaled));
    const rounded = Math.round(scaled + scaledEpsilon) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  static isAnswerCorrect(submitted, expected, tolerance, significantDigits, level) {
    const submittedNumber = this.normalizeNumericInput(submitted);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(submittedNumber) || !Number.isFinite(expectedNumber)) {
      return false;
    }
    let normalizedTolerance = Number(tolerance);
    if (!Number.isFinite(normalizedTolerance) || normalizedTolerance < 0) {
      normalizedTolerance = 0.01;
    }
    const normalizedLevel = this.normalizeLevel_(level || 'advanced');
    if (this.isPracticeLevel_(normalizedLevel)) return this.strictPracticeGrade_(submitted, expected, normalizedLevel).isCorrect;
    if (normalizedLevel === 'advanced') {
      const roundedSubmitted = this.roundToSignificantDigits(submittedNumber, 3);
      const roundedExpected = this.roundToSignificantDigits(expectedNumber, 3);
      if (roundedSubmitted === roundedExpected) {
        return true;
      }
      if (!this.shouldUseRelativeTolerance_(expectedNumber)) {
        return false;
      }
      return this.isWithinRelativeTolerance_(submittedNumber, expectedNumber, normalizedTolerance);
    }
    return this.gradeBasicLevelAnswer_(submittedNumber, {
      rawExpectedAnswer: expectedNumber,
      expectedAnswer: expectedNumber,
      significantDigits
    }).isCorrect;
  }

  static shouldUseRelativeTolerance_(expected) {
    const magnitude = Math.abs(Number(expected));
    return Number.isFinite(magnitude) && magnitude !== 0 && (magnitude < 1e-6 || magnitude >= 1e6);
  }

  static isWithinRelativeTolerance_(submitted, expected, tolerance) {
    const expectedNumber = Number(expected);
    if (expectedNumber === 0) {
      return false;
    }
    const relativeError = Math.abs(Number(submitted) - expectedNumber) / Math.abs(expectedNumber);
    return relativeError <= Number(tolerance || 0);
  }

  static buildAcceptableAnswersForBasicLevels_(problem) {
    const source = problem || {};
    const rawExpected = Number.isFinite(Number(source.rawExpectedAnswer))
      ? Number(source.rawExpectedAnswer)
      : Number(source.expectedAnswer);
    const candidates = [];
    const addCandidate = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      if (!candidates.some((candidate) => this.isSameBasicAnswerCandidate_(candidate, numeric))) {
        candidates.push(Object.is(numeric, -0) ? 0 : numeric);
      }
    };

    addCandidate(rawExpected);
    addCandidate(this.normalizeNumericInput(this.formatPlain_(rawExpected)));
    addCandidate(this.roundToSignificantDigits(rawExpected, 3));
    addCandidate(this.roundToSignificantDigits(rawExpected, 2));

    const magnitude = Math.abs(rawExpected);
    if (magnitude >= 1e-6 && magnitude < 1e6) {
      addCandidate(this.roundToDecimalPlaces_(rawExpected, 1));
      if (magnitude >= 1) {
        addCandidate(this.roundToDecimalPlaces_(rawExpected, 0));
      }
    }
    return candidates;
  }

  static gradeBasicLevelAnswer_(submittedNumber, problem) {
    const source = problem || {};
    const rawExpected = Number.isFinite(Number(source.rawExpectedAnswer))
      ? Number(source.rawExpectedAnswer)
      : Number(source.expectedAnswer);
    const candidates = this.buildAcceptableAnswersForBasicLevels_(source);
    for (const candidate of candidates) {
      if (this.isSameBasicAnswerCandidate_(submittedNumber, candidate)) {
        return {
          isCorrect: true,
          acceptedAnswer: candidate,
          acceptedAnswerType: this.isSameBasicAnswerCandidate_(candidate, rawExpected) ? 'exact' : 'rounded'
        };
      }
    }
    return {
      isCorrect: false,
      acceptedAnswer: '',
      acceptedAnswerType: ''
    };
  }

  static isSameBasicAnswerCandidate_(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      return false;
    }
    return Math.abs(leftNumber - rightNumber) <= Math.max(1e-9, Math.abs(rightNumber) * 1e-12);
  }

  static roundToDecimalPlaces_(value, digits) {
    const numeric = Number(value);
    const places = Math.max(0, Math.floor(Number(digits) || 0));
    if (!Number.isFinite(numeric)) {
      return NaN;
    }
    const factor = 10 ** places;
    const scaled = numeric * factor;
    const scaledEpsilon = Math.sign(scaled) * Number.EPSILON * Math.max(1, Math.abs(scaled));
    const rounded = Math.round(scaled + scaledEpsilon) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  static gradeProblemAnswer(problem, submittedAnswer) {
    if (!this.verifyProblemIntegrity(problem)) {
      throw new Error('問題データが改ざんされている可能性があります。新しい問題を取得してください。');
    }
    const normalizedSubmittedAnswer = this.normalizeNumericInput(submittedAnswer);
    const level = this.normalizeLevel_(problem.level);
    if (this.isPracticeLevel_(level)) return { ...this.strictPracticeGrade_(submittedAnswer, problem.expectedAnswer, level), tolerance: 1e-12 };
    const expectedForGrading = level === 'advanced'
      ? problem.expectedAnswer
      : (Number.isFinite(Number(problem.rawExpectedAnswer)) ? problem.rawExpectedAnswer : problem.expectedAnswer);
    if (level !== 'advanced') {
      const grade = this.gradeBasicLevelAnswer_(normalizedSubmittedAnswer, problem);
      return {
        normalizedSubmittedAnswer: Number.isFinite(normalizedSubmittedAnswer) ? normalizedSubmittedAnswer : '',
        isCorrect: grade.isCorrect,
        tolerance: Number(problem.tolerance || 0.01),
        acceptedAnswerType: grade.acceptedAnswerType,
        acceptedAnswer: grade.acceptedAnswer,
        exactAnswer: expectedForGrading
      };
    }
    return {
      normalizedSubmittedAnswer: Number.isFinite(normalizedSubmittedAnswer) ? normalizedSubmittedAnswer : '',
      isCorrect: this.isAnswerCorrect(submittedAnswer, expectedForGrading, problem.tolerance, problem.significantDigits, level),
      tolerance: Number(problem.tolerance || 0.01),
      acceptedAnswerType: '',
      acceptedAnswer: '',
      exactAnswer: expectedForGrading
    };
  }

  static buildExplanation(problem) {
    const s = problem.substance || {};
    const g = problem.given || {};
    const answer = `${problem.displayAnswer || this.formatNumberForDisplay_(problem.expectedAnswer, problem.significantDigits)} ${problem.unit}`;
    const molarMassText = `${s.formula || '物質'} のモル質量は ${this.formatPlain_(s.molarMass)} g/mol`;
    if (problem.problemType === 'mol_to_mass') {
      return `${molarMassText}。質量 g = mol × モル質量 g/mol なので、${this.formatPlain_(g.value)} × ${this.formatPlain_(s.molarMass)} = ${answer} です。`;
    }
    if (problem.problemType === 'mass_to_mol') {
      return `${molarMassText}。物質量 mol = 質量 g ÷ モル質量 g/mol なので、${this.formatPlain_(g.value)} ÷ ${this.formatPlain_(s.molarMass)} = ${answer} です。`;
    }
    if (problem.problemType === 'mol_to_particles') {
      return `粒子数 = mol × アボガドロ定数なので、${this.formatPlain_(g.value)} × ${this.formatScientific_(problem.avogadroConstant, problem.significantDigits)} = ${answer} です。`;
    }
    if (problem.problemType === 'particles_to_mol') {
      return `物質量 mol = 粒子数 ÷ アボガドロ定数なので、${this.formatScientific_(g.value, problem.significantDigits)} ÷ ${this.formatScientific_(problem.avogadroConstant, problem.significantDigits)} = ${answer} です。`;
    }
    if (problem.problemType === 'mol_to_gas_volume') {
      return `標準状態の気体の体積 L = mol × 22.4 L/mol なので、${this.formatPlain_(g.value)} × 22.4 = ${answer} です。`;
    }
    if (problem.problemType === 'gas_volume_to_mol') {
      return `標準状態の気体では mol = 体積 L ÷ 22.4 L/mol なので、${this.formatPlain_(g.value)} ÷ 22.4 = ${answer} です。`;
    }
    if (problem.problemType === 'mass_to_particles') {
      return `${molarMassText}。まず mol = 質量 ÷ モル質量、次に粒子数 = mol × アボガドロ定数で求めます。答えは ${answer} です。`;
    }
    if (problem.problemType === 'particles_to_mass') {
      return `${molarMassText}。まず mol = 粒子数 ÷ アボガドロ定数、次に質量 = mol × モル質量で求めます。答えは ${answer} です。`;
    }
    if (problem.problemType === 'mass_to_gas_volume') {
      return `${molarMassText}。まず mol = 質量 ÷ モル質量、次に体積 = mol × 22.4 L/mol で求めます。答えは ${answer} です。`;
    }
    if (problem.problemType === 'gas_volume_to_mass') {
      return `${molarMassText}。まず mol = 体積 ÷ 22.4、次に質量 = mol × モル質量で求めます。答えは ${answer} です。`;
    }
    if (problem.problemType === 'gas_volume_to_particles') {
      return `まず mol = 体積 ÷ 22.4、次に粒子数 = mol × アボガドロ定数で求めます。答えは ${answer} です。`;
    }
    if (problem.problemType === 'particles_to_gas_volume') {
      return `まず mol = 粒子数 ÷ アボガドロ定数、次に体積 = mol × 22.4 L/mol で求めます。答えは ${answer} です。`;
    }
    if (problem.problemType === 'atomic_mass_to_atom_mass') {
      return `原子1粒の質量 g = 原子量 g/mol ÷ アボガドロ定数なので、${this.formatPlain_(g.value)} ÷ ${this.formatScientific_(problem.avogadroConstant, problem.significantDigits)} = ${answer} です。`;
    }
    if (problem.problemType === 'mass_to_molar_mass_estimate') {
      if (g.amountMode === 'mol') {
        return `分子量・式量 g/mol = 質量 g ÷ 物質量 mol なので、${this.formatPlain_(g.value)} ÷ ${this.formatPlain_(g.secondaryValue)} = ${answer} です。`;
      }
      if (g.amountMode === 'gasVolume') {
        return `まず mol = 標準状態の体積 L ÷ 22.4、次に分子量 = 質量 g ÷ mol で求めます。答えは ${answer} です。`;
      }
      return `まず mol = 粒子数 ÷ アボガドロ定数、次に分子量・式量 = 質量 g ÷ mol で推定します。答えは ${answer} です。`;
    }
    return `計算結果は ${answer} です。`;
  }

  static verifyProblemIntegrity(problem) {
    if (!problem) {
      return false;
    }
    const expectedHash = this.createProblemHash_(problem);
    const storedHash = String(problem.problemHash || problem.contentHash || '').trim();
    const storedProblemId = String(problem.problemId || '').trim();
    if (storedHash !== '' && storedHash !== expectedHash) {
      return false;
    }
    if (storedProblemId !== '' && storedProblemId !== `MP_${expectedHash}`) {
      return false;
    }
    return storedHash !== '' || storedProblemId !== '';
  }

  static createProblemId_(problem) {
    return `MP_${this.createProblemHash_(problem)}`;
  }

  static createProblemHash_(problem) {
    return this.hashString_(this.createProblemCanonicalString_(problem));
  }

  static createAttemptId_() {
    const fallback = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const uuid = typeof Utilities !== 'undefined' && Utilities.getUuid ? Utilities.getUuid() : fallback;
    const normalizedUuid = String(uuid || fallback).trim().replace(/[^A-Za-z0-9-]/g, '');
    return `ATT_${normalizedUuid || fallback}`;
  }

  static createProblemCanonicalString_(problem) {
    const canonical = {
      level: problem.level,
      problemType: problem.problemType,
      problemTypeId: problem.problemTypeId,
      questionText: problem.questionText,
      substance: problem.substance,
      given: problem.given,
      rawExpectedAnswer: problem.rawExpectedAnswer,
      expectedAnswer: problem.expectedAnswer,
      unit: problem.unit,
      tolerance: problem.tolerance,
      significantDigits: problem.significantDigits,
      avogadroConstant: problem.avogadroConstant,
      molarVolume: problem.molarVolume,
      givenValues: problem.givenValues,
      givenValuesTitle: problem.givenValuesTitle,
      requiresRounding: problem.requiresRounding
    };
    return JSON.stringify(canonical);
  }

  static hashString_(text) {
    let hash = 2166136261;
    const source = `${text}|mol-drill-problem-v1`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(7, '0');
  }

  static getProblemTypeIdsForLevel(level) {
    return this.getLevelProfile_(this.normalizeLevel_(level)).typeIds.slice();
  }

  static getProblemTypesForLevel(level) {
    const allowedIds = this.getProblemTypeIdsForLevel(level);
    return this.getProblemTypes_()
      .filter((type) => allowedIds.includes(type.id))
      .map((type) => ({ ...type }));
  }

  static getProblemTypeId(problemType) {
    const text = String(problemType || '').trim();
    const byKey = this.getProblemTypes_().find((type) => type.key === text);
    if (byKey) {
      return byKey.id;
    }
    const numeric = Number(text);
    return Number.isInteger(numeric) ? numeric : 0;
  }

  static generateSampleProblemsForTest() {
    return {
      beginner: Array.from({ length: 5 }, () => this.generateBeginnerProblem({})),
      intermediate: Array.from({ length: 5 }, () => this.generateIntermediateProblem({})),
      advanced: Array.from({ length: 5 }, () => this.generateAdvancedProblem({}))
    };
  }

  static validateProblemGenerationSamplesForTest(count) {
    const sampleCount = Math.max(20, Number(count || 20));
    const beginner = Array.from({ length: sampleCount }, () => this.generateBeginnerProblem({}));
    const intermediate = Array.from({ length: sampleCount }, () => this.generateIntermediateProblem({}));
    const advanced = [
      ...Array.from({ length: sampleCount }, () => this.generateAdvancedProblem({})),
      this.generateAdvancedProblem({ problemType: 13 }),
      this.generateAdvancedProblem({ problemType: 14 })
    ];
    const allProblems = [...beginner, ...intermediate, ...advanced];
    const gasTypeIds = new Set([5, 6, 9, 10, 11, 12]);
    const result = {
      beginnerHasType7OrLater: beginner.some((problem) => problem.problemTypeId >= 7),
      intermediateHasType13Or14: intermediate.some((problem) => problem.problemTypeId === 13 || problem.problemTypeId === 14),
      advancedSawType13: advanced.some((problem) => problem.problemTypeId === 13),
      advancedSawType14: advanced.some((problem) => problem.problemTypeId === 14),
      gasProblemUsesNonGas: allProblems.some((problem) => gasTypeIds.has(problem.problemTypeId) && problem.substance.isGasAtSTP !== true),
      beginnerAnswersAreFriendly: beginner.every((problem) => this.isFriendlyBeginnerAnswer_(problem.expectedAnswer)),
      advancedHasRoundingCase: advanced.some((problem) => problem.requiresRounding === true)
    };
    return {
      ...result,
      ok: result.beginnerHasType7OrLater === false
        && result.intermediateHasType13Or14 === false
        && result.advancedSawType13 === true
        && result.advancedSawType14 === true
        && result.gasProblemUsesNonGas === false
        && result.beginnerAnswersAreFriendly === true
        && result.advancedHasRoundingCase === true
    };
  }

  static getLevelProfile_(level) {
    if (this.isPracticeLevel_(level)) {
      const hard = this.needsSignificantDigits_(level);
      return { level, typeIds: Object.values(this.practiceGroups_(level)).flat(),
        avogadroConstant: hard ? 6.02e23 : 6.0e23, significantDigits: 3,
        tolerance: 1e-12, molValues: hard ? [0.137, 0.286, 0.734, 1.37, 2.48, 3.16] : [0.5, 1, 2, 3],
        advancedMolValues: [] };
    }
    if (level === 'intermediate') {
      return this.applyConfiguredLevelSettings_({
        level: 'intermediate',
        typeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        avogadroConstant: MOL_DRILL_LEVEL_SETTING_DEFAULTS.intermediate.avogadroConstant,
        significantDigits: 3,
        tolerance: MOL_DRILL_LEVEL_SETTING_DEFAULTS.intermediate.tolerance,
        molValues: [0.125, 0.25, 0.375, 0.5, 0.75, 1.25, 1.5, 2.5],
        advancedMolValues: [0.125, 0.25, 0.375, 0.5, 0.75, 1.25, 1.5, 2.5]
      });
    }
    if (level === 'advanced') {
      return this.applyConfiguredLevelSettings_({
        level: 'advanced',
        typeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        avogadroConstant: MOL_DRILL_LEVEL_SETTING_DEFAULTS.advanced.avogadroConstant,
        significantDigits: 3,
        tolerance: MOL_DRILL_LEVEL_SETTING_DEFAULTS.advanced.tolerance,
        molValues: [0.137, 0.286, 0.734, 1.37, 2.48, 3.16],
        advancedMolValues: [0.137, 0.286, 0.734, 1.37, 2.48, 3.16]
      });
    }
    return this.applyConfiguredLevelSettings_({
      level: 'beginner',
      typeIds: [1, 2, 3, 4, 5, 6],
      avogadroConstant: MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner.avogadroConstant,
      significantDigits: 2,
      tolerance: MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner.tolerance,
      molValues: [0.5, 1.0, 2.0, 3.0],
      advancedMolValues: [0.5, 1.0, 2.0, 3.0]
    });
  }

  static applyConfiguredLevelSettings_(profile) {
    const defaults = MOL_DRILL_LEVEL_SETTING_DEFAULTS[profile.level] || MOL_DRILL_LEVEL_SETTING_DEFAULTS.beginner;
    return {
      ...profile,
      avogadroConstant: this.readPositiveNumberSetting_(defaults.avogadroConstantKey, profile.avogadroConstant),
      tolerance: this.readPositiveNumberSetting_(defaults.toleranceKey, profile.tolerance)
    };
  }

  static readPositiveNumberSetting_(key, fallback) {
    const cache = this.getLevelSettingCache_();
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key];
    }
    const values = this.getLevelSettingValues_();
    let value = fallback;
    try {
      const numeric = Number(values[key]);
      if (Number.isFinite(numeric) && numeric > 0) {
        value = numeric;
      }
    } catch (_ignored) {
      // Problem generation also runs in local tests and before setup; use level defaults then.
    }
    cache[key] = value;
    return value;
  }

  static getLevelSettingValues_() {
    if (this.levelSettingRawValues_) {
      return this.levelSettingRawValues_;
    }
    const scriptCache = this.getLevelSettingScriptCache_();
    const cacheKey = this.getLevelSettingScriptCacheKey_();
    if (scriptCache) {
      try {
        const cached = scriptCache.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            this.levelSettingRawValues_ = parsed;
            return this.levelSettingRawValues_;
          }
        }
      } catch (_ignored) {
        // Corrupted cache is ignored and settings are read from the sheet.
      }
    }
    const keys = this.getLevelSettingKeys_();
    let values = {};
    try {
      values = SheetRepository.getSettingValues(keys);
    } catch (_ignored) {
      values = {};
    }
    keys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        values[key] = '';
      }
    });
    this.levelSettingRawValues_ = values;
    if (scriptCache) {
      try {
        scriptCache.put(cacheKey, JSON.stringify(values), 120);
      } catch (_ignored) {
        // Script cache is an optimization only.
      }
    }
    return this.levelSettingRawValues_;
  }

  static getLevelSettingKeys_() {
    return Object.values(MOL_DRILL_LEVEL_SETTING_DEFAULTS)
      .flatMap((defaults) => [defaults.avogadroConstantKey, defaults.toleranceKey]);
  }

  static getLevelSettingScriptCache_() {
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        return CacheService.getScriptCache();
      }
    } catch (_ignored) {
      return null;
    }
    return null;
  }

  static getLevelSettingScriptCacheKey_() {
    return 'molDrill:levelSettings:v1';
  }

  static clearLevelSettingCache_() {
    this.levelSettingCache_ = {};
    this.levelSettingRawValues_ = null;
    const scriptCache = this.getLevelSettingScriptCache_();
    if (!scriptCache) {
      return;
    }
    try {
      scriptCache.remove(this.getLevelSettingScriptCacheKey_());
    } catch (_ignored) {
      // Ignore cache removal failures.
    }
  }

  static getLevelSettingCache_() {
    if (!this.levelSettingCache_) {
      this.levelSettingCache_ = {};
    }
    return this.levelSettingCache_;
  }

  static getProblemTypes_() {
    return [
      { id: 1, key: 'mol_to_mass' },
      { id: 2, key: 'mass_to_mol' },
      { id: 3, key: 'mol_to_particles' },
      { id: 4, key: 'particles_to_mol' },
      { id: 5, key: 'mol_to_gas_volume', requiresGasAtSTP: true },
      { id: 6, key: 'gas_volume_to_mol', requiresGasAtSTP: true },
      { id: 7, key: 'mass_to_particles' },
      { id: 8, key: 'particles_to_mass' },
      { id: 9, key: 'mass_to_gas_volume', requiresGasAtSTP: true },
      { id: 10, key: 'gas_volume_to_mass', requiresGasAtSTP: true },
      { id: 11, key: 'gas_volume_to_particles', requiresGasAtSTP: true },
      { id: 12, key: 'particles_to_gas_volume', requiresGasAtSTP: true },
      { id: 13, key: 'atomic_mass_to_atom_mass', advancedOnly: true },
      { id: 14, key: 'mass_to_molar_mass_estimate', advancedOnly: true }
    ];
  }

  static getProblemTypeById_(id) {
    const type = this.getProblemTypes_().find((item) => item.id === id);
    if (!type) {
      throw new Error(`未知の問題タイプです: ${id}`);
    }
    return type;
  }

  static resolveProblemTypeId_(requestedType, allowedTypeIds) {
    const requestedId = this.getProblemTypeId(requestedType);
    if (allowedTypeIds.includes(requestedId)) {
      return requestedId;
    }
    return this.pickNumber_(allowedTypeIds);
  }

  static getSubstances_() {
    return [
      { formula: 'H2O', name: '水', molarMass: 18.0, isGasAtSTP: false, type: 'compound' },
      { formula: 'CO2', name: '二酸化炭素', molarMass: 44.0, isGasAtSTP: true, type: 'compound' },
      { formula: 'O2', name: '酸素', molarMass: 32.0, isGasAtSTP: true, type: 'elemental-molecule' },
      { formula: 'H2', name: '水素', molarMass: 2.0, isGasAtSTP: true, type: 'elemental-molecule' },
      { formula: 'N2', name: '窒素', molarMass: 28.0, isGasAtSTP: true, type: 'elemental-molecule' },
      { formula: 'NH3', name: 'アンモニア', molarMass: 17.0, isGasAtSTP: true, type: 'compound' },
      { formula: 'NaCl', name: '塩化ナトリウム', molarMass: 58.5, isGasAtSTP: false, type: 'ionic' },
      { formula: 'C6H12O6', name: 'グルコース', molarMass: 180, isGasAtSTP: false, type: 'compound' },
      { formula: 'CH4', name: 'メタン', molarMass: 16.0, isGasAtSTP: true, type: 'compound' },
      { formula: 'HCl', name: '塩化水素', molarMass: 36.5, isGasAtSTP: true, type: 'compound' },
      { formula: 'CaCO3', name: '炭酸カルシウム', molarMass: 100, isGasAtSTP: false, type: 'ionic' },
      { formula: 'H2SO4', name: '硫酸', molarMass: 98.0, isGasAtSTP: false, type: 'compound' }
    ];
  }

  static getSubstances() {
    return this.getSubstances_().map((substance) => ({ ...substance }));
  }

  static getGasSubstances_() {
    return this.getSubstances_().filter((substance) => substance.isGasAtSTP === true);
  }

  static getElements_() {
    return [
      { formula: 'H', name: '水素', atomicMass: 1.0, isGasAtSTP: false, type: 'element' },
      { formula: 'C', name: '炭素', atomicMass: 12.0, isGasAtSTP: false, type: 'element' },
      { formula: 'N', name: '窒素', atomicMass: 14.0, isGasAtSTP: false, type: 'element' },
      { formula: 'O', name: '酸素', atomicMass: 16.0, isGasAtSTP: false, type: 'element' },
      { formula: 'Na', name: 'ナトリウム', atomicMass: 23.0, isGasAtSTP: false, type: 'element' },
      { formula: 'Mg', name: 'マグネシウム', atomicMass: 24.0, isGasAtSTP: false, type: 'element' },
      { formula: 'S', name: '硫黄', atomicMass: 32.0, isGasAtSTP: false, type: 'element' },
      { formula: 'Cl', name: '塩素', atomicMass: 35.5, isGasAtSTP: false, type: 'element' },
      { formula: 'Ca', name: 'カルシウム', atomicMass: 40.0, isGasAtSTP: false, type: 'element' },
      { formula: 'Fe', name: '鉄', atomicMass: 56.0, isGasAtSTP: false, type: 'element' }
    ];
  }

  static pickSubstance_(gasOnly) {
    return this.pickNumber_(gasOnly ? this.getGasSubstances_() : this.getSubstances_());
  }

  static pickElement_() {
    return this.pickNumber_(this.getElements_());
  }

  static pickNumber_(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  static normalizeLevel_(level) {
    const normalized = String(level || 'lv1').trim().toLowerCase();
    if (this.isPracticeLevel_(normalized)) return normalized;
    if (['初級', 'basic', 'beginner'].includes(normalized)) {
      return 'beginner';
    }
    if (['中級', 'standard', 'intermediate'].includes(normalized)) {
      return 'intermediate';
    }
    if (['上級', 'advanced'].includes(normalized)) {
      return 'advanced';
    }
    return 'beginner';
  }

  static roundForProblem_(value, profile) {
    if (this.isPracticeLevel_(profile.level)) return this.needsSignificantDigits_(profile.level) ? this.roundToSignificantDigits(value, 3) : this.normalizeExactExpectedAnswer_(value);
    return profile.level === 'advanced' ? this.roundToSignificantDigits(value, profile.significantDigits) : this.roundToSignificantDigits(value, Math.max(profile.significantDigits, 3));
  }

  static requiresRounding_(rawValue, roundedValue) {
    const raw = Number(rawValue);
    const rounded = Number(roundedValue);
    if (!Number.isFinite(raw) || !Number.isFinite(rounded)) {
      return false;
    }
    return Math.abs(raw - rounded) > Math.max(Math.abs(raw) * 1e-10, 1e-10);
  }

  static isFriendlyBeginnerAnswer_(value) {
    const numeric = Math.abs(Number(value));
    if (!Number.isFinite(numeric)) {
      return false;
    }
    if (numeric >= 1e10) {
      const scaled = numeric / 1e23;
      return Math.abs(scaled - Math.round(scaled * 2) / 2) < 1e-9;
    }
    const friendlySteps = [1, 0.5, 0.25, 0.1];
    return friendlySteps.some((step) => Math.abs(numeric / step - Math.round(numeric / step)) < 1e-9);
  }

  static createInputHint_(problem) {
    if (this.needsSignificantDigits_(problem.level)) {
      if (problem.unit === '個' || Math.abs(Number(problem.expectedAnswer || 0)) >= 100000) {
        return '有効数字3桁で答えよう。例: 6.02×10^23 または 6.02x10^23';
      }
      return `有効数字3桁で答えよう。単位 ${problem.unit} は入力しません。`;
    }
    if (problem.unit === '個' || Math.abs(Number(problem.expectedAnswer || 0)) >= 100000) {
      return '数値のみ。例: 6.0×10^23 または 6.0x10^23';
    }
    return `数値のみ。単位 ${problem.unit} は入力しません。`;
  }

  static formatPlain_(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return String(value);
    }
    if (Math.abs(numeric) >= 100000 || Math.abs(numeric) < 0.001 && numeric !== 0) {
      return this.formatScientific_(numeric, 3);
    }
    return String(Number(numeric.toFixed(6)));
  }

  static formatScientific_(value, digits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return String(value);
    }
    const [coefficient, exponent] = numeric.toExponential(Math.max(0, Number(digits || 3) - 1)).split('e');
    return `${coefficient}×10^${Number(exponent)}`;
  }

  static formatNumberForDisplay_(value, digits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return String(value);
    }
    const normalizedDigits = Number(digits || 3);
    if (Math.abs(numeric) >= 100000 || Math.abs(numeric) < 0.001 && numeric !== 0) {
      return this.formatScientific_(numeric, normalizedDigits);
    }
    return numeric.toPrecision(normalizedDigits);
  }
}

class AdaptiveProblemService {
  static isEnabled(options) {
    const source = options || {};
    if (source.disableAdaptiveProblemSelection === true || source.adaptiveProblemSelection === false) {
      return false;
    }
    if (String(source.problemType || '').trim() !== '') {
      return false;
    }
    try {
      const raw = String(SheetRepository.getSettingValue('ENABLE_ADAPTIVE_PROBLEM_SELECTION') || '').trim().toLowerCase();
      if (raw === '') {
        return true;
      }
      return !['false', '0', 'off', 'no', '無効'].includes(raw);
    } catch (_ignored) {
      return true;
    }
  }

  static buildIssueOptionsForStudent(tokenRow, options) {
    const source = options || {};
    if (!this.isEnabled(source)) {
      return { ...source };
    }
    const level = MolProblemService.normalizeLevel_(source.level);
    const problemType = this.selectProblemTypeForStudent(tokenRow, level, source);
    if (!problemType) {
      return { ...source, level };
    }
    return {
      ...source,
      level,
      problemType
    };
  }

  static selectProblemTypeForStudent(tokenRow, level, _options) {
    const normalizedLevel = MolProblemService.normalizeLevel_(level);
    const statsRows = this.readStatsRowsForSelection_(tokenRow, normalizedLevel);
    if (!Array.isArray(statsRows)) {
      return '';
    }
    const recentTypes = this.readRecentProblemTypes_(tokenRow, normalizedLevel, statsRows);
    const weights = this.buildProblemTypeWeights(normalizedLevel, statsRows, recentTypes);
    return this.pickWeightedProblemType_(weights);
  }

  static buildProblemTypeWeights(level, statsRows, recentLogsOrRecentTypes) {
    const normalizedLevel = MolProblemService.normalizeLevel_(level);
    const allowedTypes = MolProblemService.getProblemTypesForLevel(normalizedLevel).map((type) => type.key);
    const levelRows = (statsRows || []).filter((row) => String(row.level || '') === normalizedLevel);
    const statsByType = new Map(levelRows.map((row) => [String(row.problemType || ''), row]));
    const recentTypes = this.normalizeRecentProblemTypes_(recentLogsOrRecentTypes);
    const elapsedValues = levelRows
      .map((row) => Number(row.recentAverageElapsedMs || row.averageElapsedMs || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const studentAverageElapsedMs = elapsedValues.length > 0
      ? elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length
      : 0;

    return allowedTypes.map((problemType) => {
      const row = statsByType.get(problemType) || {};
      const attempts = Number(row.attempts || 0);
      const recentAttempts = Number(row.recentAttempts || 0);
      const accuracy = Number(row.accuracy || 0);
      const recentAccuracy = Number(row.recentAccuracy || 0);
      const elapsedMs = Number(row.recentAverageElapsedMs || row.averageElapsedMs || 0);
      let weight = 1;
      const reasons = [];

      if (!row.problemType || attempts <= 0) {
        weight += 4;
        reasons.push('unattempted');
      } else if (attempts <= 2) {
        weight += 2;
        reasons.push('lowAttempts');
      }
      if (attempts >= 3 && accuracy < 0.6) {
        weight += 4;
        reasons.push('lowAccuracy');
      }
      if (recentAttempts >= 3 && recentAccuracy < 0.6) {
        weight += 3;
        reasons.push('lowRecentAccuracy');
      }
      if (studentAverageElapsedMs > 0 && elapsedMs > studentAverageElapsedMs * 1.25) {
        weight += 1;
        reasons.push('slow');
      }
      if (recentTypes.length >= 2 && recentTypes[0] === problemType && recentTypes[1] === problemType) {
        weight = 0;
        reasons.push('preventThirdRepeat');
      } else if (recentTypes[0] === problemType) {
        weight = Math.max(0.1, weight * 0.35);
        reasons.push('recentRepeatPenalty');
      }

      return {
        problemType,
        weight: Math.round(weight * 1000) / 1000,
        attempts,
        accuracy,
        recentAttempts,
        recentAccuracy,
        reasons
      };
    });
  }

  static readStatsRowsForSelection_(tokenRow, level) {
    const rosterKey = String(tokenRow && tokenRow.rosterKey || '').trim();
    if (rosterKey === '') {
      return null;
    }
    const cached = this.readStatsRowsFromCache_(rosterKey, level);
    if (Array.isArray(cached)) {
      return cached;
    }
    try {
      const rows = SheetRepository.readProblemTypeStatsForRosterKey(rosterKey)
        .filter((row) => String(row.level || '') === level);
      this.writeStatsRowsToCache_(rosterKey, level, rows);
      return rows;
    } catch (_ignored) {
      return null;
    }
  }

  static readRecentProblemTypes_(tokenRow, level, statsRows) {
    const rosterKey = String(tokenRow && tokenRow.rosterKey || '').trim();
    const cached = this.readRecentProblemTypesFromCache_(rosterKey, level);
    if (cached.length > 0) {
      return cached;
    }
    return (statsRows || [])
      .filter((row) => String(row.level || '') === level && String(row.lastAnsweredAt || '') !== '')
      .slice()
      .sort((a, b) => String(b.lastAnsweredAt || '').localeCompare(String(a.lastAnsweredAt || '')))
      .map((row) => String(row.problemType || ''))
      .filter((problemType) => problemType !== '')
      .slice(0, 2);
  }

  static rememberIssuedProblemType(tokenRow, level, problemType) {
    const rosterKey = String(tokenRow && tokenRow.rosterKey || '').trim();
    const normalizedLevel = MolProblemService.normalizeLevel_(level);
    const normalizedProblemType = String(problemType || '').trim();
    if (rosterKey === '' || normalizedProblemType === '') {
      return;
    }
    const recentTypes = [normalizedProblemType, ...this.readRecentProblemTypesFromCache_(rosterKey, normalizedLevel)].slice(0, 2);
    this.writeRecentProblemTypesToCache_(rosterKey, normalizedLevel, recentTypes);
  }

  static clearStatsCache(rosterKey, level) {
    const cache = this.getCache_();
    if (!cache) {
      return;
    }
    try {
      const key = this.createStatsCacheKey_(rosterKey, level);
      if (cache.remove) {
        cache.remove(key);
      } else if (cache.put) {
        cache.put(key, '', 1);
      }
    } catch (_ignored) {
      // Adaptive cache is best-effort; generation must continue.
    }
  }

  static readStatsRowsFromCache_(rosterKey, level) {
    const cache = this.getCache_();
    if (!cache) {
      return null;
    }
    try {
      const raw = cache.get(this.createStatsCacheKey_(rosterKey, level));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_ignored) {
      return null;
    }
  }

  static writeStatsRowsToCache_(rosterKey, level, rows) {
    const cache = this.getCache_();
    if (!cache) {
      return;
    }
    try {
      cache.put(this.createStatsCacheKey_(rosterKey, level), JSON.stringify(rows || []), 300);
    } catch (_ignored) {
      // CacheService failures must not block problem generation.
    }
  }

  static readRecentProblemTypesFromCache_(rosterKey, level) {
    const cache = this.getCache_();
    if (!cache) {
      return [];
    }
    try {
      const raw = cache.get(this.createRecentTypesCacheKey_(rosterKey, level));
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => String(item || '')).filter((item) => item !== '').slice(0, 2) : [];
    } catch (_ignored) {
      return [];
    }
  }

  static writeRecentProblemTypesToCache_(rosterKey, level, recentTypes) {
    const cache = this.getCache_();
    if (!cache) {
      return;
    }
    try {
      cache.put(this.createRecentTypesCacheKey_(rosterKey, level), JSON.stringify((recentTypes || []).slice(0, 2)), 60 * 30);
    } catch (_ignored) {
      // CacheService failures must not block problem generation.
    }
  }

  static normalizeRecentProblemTypes_(recentLogsOrRecentTypes) {
    return (recentLogsOrRecentTypes || [])
      .map((item) => typeof item === 'string' ? item : String(item && item.problemType || ''))
      .filter((problemType) => problemType !== '')
      .slice(0, 2);
  }

  static pickWeightedProblemType_(weights) {
    const candidates = (weights || []).filter((row) => Number(row.weight || 0) > 0);
    if (candidates.length === 0) {
      return '';
    }
    const totalWeight = candidates.reduce((sum, row) => sum + Number(row.weight || 0), 0);
    if (totalWeight <= 0) {
      return '';
    }
    let point = Math.random() * totalWeight;
    for (const row of candidates) {
      point -= Number(row.weight || 0);
      if (point <= 0) {
        return row.problemType;
      }
    }
    return candidates[candidates.length - 1].problemType;
  }

  static createStatsCacheKey_(rosterKey, level) {
    return `adaptiveStats:${this.hashKey_(`${rosterKey}|${level}`)}`;
  }

  static createRecentTypesCacheKey_(rosterKey, level) {
    return `adaptiveRecent:${this.hashKey_(`${rosterKey}|${level}`)}`;
  }

  static hashKey_(text) {
    let hash = 2166136261;
    const source = `${String(text || '')}|adaptive-problem-v1`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  static getCache_() {
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        return CacheService.getScriptCache();
      }
    } catch (_ignored) {
      return null;
    }
    return null;
  }
}

// Versioned, deterministic policy. Progress is derived only from server-issued
// automatic questions and persisted answers, never from browser-supplied scores.
class AutoPracticeService {
  static initial_() { return {version:1, level:'lv1', category:'mol_mass', stageId:0, recent:[], resume:null, reason:'start'}; }
  static groups_(level) { return MolProblemService.practiceGroups_(level); }
  static focused_(level) { return ['lv1','lv3'].includes(level); }
  static types_(state) { const groups=this.groups_(state.level); return this.focused_(state.level) ? groups[state.category] : Object.values(groups).flat(); }
  static metadata_(state) { return {version:1, level:state.level, category:state.category, stageId:state.stageId}; }
  static move_(state, level, category, reason) {
    state.level=level; state.category=this.focused_(level) ? (category || Object.keys(this.groups_(level))[0]) : '';
    state.stageId++; state.recent=[]; state.reason=reason;
  }
  static apply_(state, row) {
    const info=AnswerService.parseClientInfo_(row.clientInfo), meta=info.autoPractice;
    if(!meta || meta.version!==1 || meta.stageId!==state.stageId || meta.level!==state.level || meta.category!==state.category || row.level!==state.level) return state;
    const type=MolProblemService.getProblemTypes_().find(item=>item.key===row.problemType);
    if(!type || !this.types_(state).includes(type.id)) return state;
    state.recent.push({type:type.id, correct:row.isCorrect===true, precision:row.isCorrect!==true && info.acceptedAnswerType==='precision'});
    state.recent=state.recent.slice(-10);
    const focused=this.focused_(state.level), window=state.recent.slice(focused ? -5 : -10);
    const types=this.types_(state);
    const ready=window.length >= (focused ? 5 : 10)
      && window.filter(item=>item.correct).length >= (focused ? 4 : 8)
      && types.every(id=>window.filter(item=>item.type===id).length >= (focused ? 2 : 1));
    state.reason=window.slice(-2).some(item=>item.precision) ? 'precision' : 'practice';
    if(ready) {
      if(state.resume) {
        const resume=state.resume; state.resume=null;
        this.move_(state,resume.level,resume.category,'return');
      } else if(focused) {
        const groups=Object.keys(this.groups_(state.level)), index=groups.indexOf(state.category);
        if(index<groups.length-1) this.move_(state,state.level,groups[index+1],'new-category');
        else this.move_(state,'lv'+(Number(state.level.slice(2))+1),'','advance');
      } else if(state.level!=='lv6') this.move_(state,'lv'+(Number(state.level.slice(2))+1),'','advance');
      else state.reason='steady';
    } else if(!state.resume && state.recent.length>=5 && state.recent.slice(-3).every(item=>!item.correct && !item.precision) && state.level!=='lv1') {
      // Precision-only mistakes keep the current numerical difficulty. Support
      // preserves the skill family: Lv.5 -> Lv.2, Lv.6 -> Lv.4.
      const lower={lv2:'lv1',lv3:'lv1',lv4:'lv3',lv5:'lv2',lv6:'lv4'}[state.level];
      const lastType=type.id;
      let category=Object.keys(this.groups_(lower)).find(key=>this.groups_(lower)[key].includes(lastType));
      if(!category) category=state.category==='volume_particles' ? 'mol_volume' : 'mol_mass';
      state.resume={level:state.level,category:state.category};
      this.move_(state,lower,category,'support');
    }
    return state;
  }
  static rebuild_(rows) {
    const state=this.initial_();
    rows.forEach(row=>this.apply_(state,row));
    return state;
  }
  static plan_(state) {
    const messages={start:'まずはmolと質量の変換から。できたことを積み上げていこう。',
      practice:'今の変換を練習中。あせらず、式を確かめながら進めよう。',
      'new-category':'この変換はいい感じ！ 次は別の変換を試してみよう。',
      advance:'いろいろな向きでできてきたね。次のレベルを試してみよう。',
      support:'いったん基礎の変換で確認しよう。できてきたら元の練習に戻れるよ。',
      return:'基礎の確認ができたね。さっきの練習をもう一度試してみよう。',
      precision:'数値が合っている問題もあるね。最後に有効数字3桁を確認しよう。',
      steady:'Lv.6でもできてきたね。いろいろな変換を続けて確かめよう。'};
    return {mode:'auto', version:1, level:state.level, category:state.category, stageId:state.stageId,
      focusLabel:({mol_mass:'mol ⇔ 質量',mol_particles:'mol ⇔ 個数',mol_volume:'mol ⇔ 体積',mass_particles:'質量 ⇔ 個数',mass_volume:'質量 ⇔ 体積',volume_particles:'体積 ⇔ 個数'})[state.category] || 'いろいろな変換',
      message:messages[state.reason] || messages.practice, support:!!state.resume};
  }
  static issue_(tokenRow) {
    const data=AnswerService.runtimeData_(tokenRow);
    const state=data.autoPractice || this.initial_(), types=this.types_(state);
    // Cover both directions before moving up; favor less-practiced directions.
    const score=id=>state.recent.filter(item=>item.type===id).reduce((sum,item)=>sum+(item.correct?1:0.75),0);
    const type=types.slice().sort((a,b)=>score(a)-score(b)||a-b)[0];
    const profile=MolProblemService.getLevelProfile_(state.level);
    profile.typeIds=types;
    const problem=MolProblemService.generateLevelProblem_(profile,{problemType:type});
    problem.category=state.category;
    problem.autoPractice=this.metadata_(state);
    MolProblemService.storeProblemForToken(tokenRow.token,problem);
    const publicProblem=MolProblemService.toPublicProblem(problem);
    publicProblem.learningPlan=this.plan_(state);
    return {problem,publicProblem};
  }
}

// Compact, deterministic evidence for self-study. Only recorded, graded answers enter here.
class StudentLearningService {
  static initial_() { return {cells:{},mistakes:[]}; }
  static label_(key) {
    const units={mol:'mol',mass:'質量',particles:'個数',gas_volume:'体積'};
    return String(key).split('_to_').map(part=>units[part] || part).join(' → ');
  }
  static apply_(data, row) {
    const result=data || this.initial_();
    if (!/^lv[1-6]$/.test(String(row.level))) return result;
    const type=MolProblemService.getProblemTypes_().find(item=>item.key===row.problemType);
    const groups=MolProblemService.practiceGroups_(row.level);
    if (!type || !Object.keys(groups).some(key=>groups[key].includes(type.id))) return result;
    const key=row.level+':'+type.key;
    const cell=result.cells[key] || {attempts:0,correct:0,recent:[]};
    const correct=row.isCorrect===true;
    const acceptance=AnswerService.extractAnswerAcceptanceFromClientInfo_(row.clientInfo);
    const precision=!correct && acceptance.acceptedAnswerType==='precision';
    cell.attempts+=1;cell.correct+=correct?1:0;
    cell.recent=cell.recent.concat({correct,precision}).slice(-5);result.cells[key]=cell;
    if(!correct) result.mistakes=result.mistakes.concat({
      timestamp:String(row.timestamp || ''), level:row.level, problemType:row.problemType,
      questionText:String(row.questionText || '').slice(0,900),
      submittedAnswer:String(row.submittedAnswer == null ? '' : row.submittedAnswer).slice(0,120),
      expectedAnswerText:row.expectedAnswer==='' || row.expectedAnswer==null ? '記録なし' : AnswerService.formatAnswerText_(row.expectedAnswer,row.unit,row.significantDigits,row.level),
      unit:String(row.unit || ''),explanation:String(row.explanation || '').slice(0,1500),
      acceptedAnswerType:precision?'precision':''
    }).slice(-5);
    return result;
  }
  static rebuild_(rows) { return rows.reduce((data,row)=>this.apply_(data,row),this.initial_()); }
  static check_(data, summary, requestedLevel) {
    const level=String(requestedLevel || 'lv1');
    if(!/^lv[1-6]$/.test(level)) throw new Error('確認するレベルを選んでください。');
    const groups=MolProblemService.practiceGroups_(level);
    const rows=[];
    for(const category of Object.keys(groups)) for(const id of groups[category]) {
      const type=MolProblemService.getProblemTypeById_(id);
      const cell=data.cells[level+':'+type.key] || {attempts:0,correct:0,recent:[]};
      const recentCorrect=cell.recent.filter(item=>item.correct).length;
      rows.push({problemType:type.key,label:this.label_(type.key),category,attempts:cell.attempts,correct:cell.correct,
        recentAttempts:cell.recent.length,recentCorrect,precision:cell.recent.filter(item=>item.precision).length,
        confirmed:cell.recent.length===5 && recentCorrect>=4});
    }
    const confirmed=rows.filter(row=>row.confirmed).length;
    const precision=rows.find(row=>row.recentAttempts>=3 && row.precision>=2);
    const weak=rows.filter(row=>row.recentAttempts>=3 && row.recentAttempts-row.recentCorrect-row.precision>=2)
      .sort((a,b)=>a.recentCorrect/a.recentAttempts-b.recentCorrect/b.recentAttempts)[0];
    const next=rows.slice().sort((a,b)=>a.recentAttempts-b.recentAttempts || a.recentCorrect-b.recentCorrect)[0];
    let advice;
    if(precision) advice={kind:'precision',message:'計算の数値は合っています。有効数字を一緒に確認しよう。',
      evidence:precision.label+'の直近'+precision.recentAttempts+'問で、有効数字だけの違いが'+precision.precision+'問あります。',
      tip:'最後に有効数字3桁へ。末尾の0も大切です（例：1.20、6.00×10^23）。',target:{level,category:precision.category}};
    else if(weak) {
      const targetLevel=({lv2:'lv1',lv4:'lv3',lv5:'lv1',lv6:'lv3'})[level] || level;
      advice={kind:'practice',message:weak.label+'を、もう少し試してみよう。',
        evidence:'この変換の直近'+weak.recentAttempts+'問は'+weak.recentCorrect+'問正解です。',
        tip:weak.problemType.startsWith('mol_to_')?'molから求める量の「1 mol分」を掛けてみよう。'
          :weak.problemType.endsWith('_to_mol')?'まず「1 mol分の量」で割ると、molに直せます。'
          :'まずmolに直してから、求める量の「1 mol分」を掛けてみよう。',target:{level:targetLevel,category:weak.category}};
    } else if(confirmed===6 && level!=='lv6') advice={kind:'challenge',message:'そろそろ次のレベルを試してみてもよさそう！',
      evidence:'6方向すべてで直近5問中4問以上正解しています。',tip:'難しければ、いつでも好きなレベルへ戻れます。',
      target:{level:'lv'+(Number(level.slice(2))+1),category:['lv2','lv5'].includes(level)?'mass_particles':'mol_mass'}};
    else advice={kind:'explore',message:confirmed===6?'ここまでよく取り組めています。この調子で続けよう。':(['lv1','lv3'].includes(level)?'次は'+next.label+'を試してみよう。':'ランダムでいろいろな変換を試してみよう。'),
      evidence:next.recentAttempts<3?'まだ記録が少ない変換があります。苦手かどうかは、もう少し試してから。':'この変換の直近'+next.recentAttempts+'問は'+next.recentCorrect+'問正解です。',
      tip:'途中で終わっても、これまでの正解は残ります。自分のペースでどうぞ。',target:{level,category:next.category}};
    return {level,summary:{totalAttempts:Number(summary.totalAttempts || 0),totalCorrect:Number(summary.totalCorrect || 0)},
      advice,coverage:{confirmed,total:6},rows,mistakes:data.mistakes.slice().reverse()};
  }
}

class AnswerService {
  static runtimeSummaryKey_(tokenRow) { return 'studentSummary:v6:' + String(tokenRow.token); }
  static readRuntimeSummaryCache_(tokenRow) {
    try {
      const cache = this.getStudentAccessCache_();
      const data = JSON.parse(cache ? cache.get(this.runtimeSummaryKey_(tokenRow)) || 'null' : 'null');
      return data && data.rosterKey === tokenRow.rosterKey && Array.isArray(data.recent) && data.learning ? data : null;
    } catch (_) { return null; }
  }
  static writeRuntimeSummaryCache_(tokenRow, data) {
    const cache = this.getStudentAccessCache_();
    if (!cache) return;
    try { cache.put(this.runtimeSummaryKey_(tokenRow), JSON.stringify(data), 21600); }
    catch (_) { try { cache.remove(this.runtimeSummaryKey_(tokenRow)); } catch (ignored) {} }
  }
  static rebuildRuntimeSummary_(tokenRow) {
    const rows = SheetRepository.readAnswerLogsForRosterKey(tokenRow.rosterKey);
    const summary = this.summarizeAnswerLogsForStudent(tokenRow.rosterKey, rows);
    const recent = rows.slice().sort((a,b) => String(a.timestamp).localeCompare(String(b.timestamp))).slice(-10)
      .map(row => ({ isCorrect: row.isCorrect === true, level: row.level }));
    const data = { rosterKey: tokenRow.rosterKey, summary, recent, autoPractice:AutoPracticeService.rebuild_(rows), learning:StudentLearningService.rebuild_(rows) };
    this.writeRuntimeSummaryCache_(tokenRow, data);
    return data;
  }
  static runtimeData_(tokenRow) {
    const hit = this.readRuntimeSummaryCache_(tokenRow);
    if (hit) return hit;
    let data;
    SheetRepository.withDocumentLock(() => { data = this.readRuntimeSummaryCache_(tokenRow) || this.rebuildRuntimeSummary_(tokenRow); });
    return data;
  }
  static runtimeSummary_(tokenRow) { return this.runtimeData_(tokenRow).summary; }
  static updateRuntimeSummary_(tokenRow, entry, duplicate) {
    let data = this.readRuntimeSummaryCache_(tokenRow);
    if (!data) return this.rebuildRuntimeSummary_(tokenRow).summary;
    if (!duplicate) {
      const summary = data.summary;
      data.recent = data.recent.concat({isCorrect: entry.isCorrect === true, level: entry.level}).slice(-10);
      summary.totalAttempts += 1;
      summary.totalCorrect += entry.isCorrect === true ? 1 : 0;
      summary.totalAccuracy = this.roundRate_(summary.totalCorrect, summary.totalAttempts);
      summary.recent10Attempts = data.recent.length;
      summary.recent10Correct = data.recent.filter(item => item.isCorrect).length;
      summary.recent10Accuracy = this.roundRate_(summary.recent10Correct, data.recent.length);
      summary.currentCorrectStreak = entry.isCorrect ? Number(summary.currentCorrectStreak || 0) + 1 : 0;
      summary.lastAnsweredAt = entry.timestamp;
      summary.lastLevel = entry.level;
      data.autoPractice=AutoPracticeService.apply_(data.autoPractice || AutoPracticeService.initial_(),entry);
      data.learning=StudentLearningService.apply_(data.learning,entry);
      this.writeRuntimeSummaryCache_(tokenRow, data);
    }
    return data.summary;
  }

  static initializeTeacherPreviewSession(authToken, options) {
    const startedAtMs = Date.now();
    let problemElapsedMs = 0;
    try {
      AdminService.assertAdminAccess(authToken);
      const student = this.getTeacherPreviewStudent_(options && options.studentToken);
      const problemStartedAtMs = Date.now();
      const problem = MolProblemService.issueProblemForToken(this.createTeacherPreviewProblemKey_(authToken), options || {}).publicProblem;
      problemElapsedMs = Date.now() - problemStartedAtMs;
      return {
        ok: true,
        teacherPreview: true,
        student,
        summary: this.buildTeacherPreviewSummary_(student),
        problem
      };
    } finally {
      LoggerService.logDeveloperInfo(`initializeTeacherPreviewSession elapsedMs=${Date.now() - startedAtMs} problemElapsedMs=${problemElapsedMs} mode=teacherPreview`);
    }
  }

  static getTeacherPreviewProblem(authToken, options) {
    const startedAtMs = Date.now();
    let problemElapsedMs = 0;
    try {
      AdminService.assertAdminAccess(authToken);
      const problemStartedAtMs = Date.now();
      const problem = MolProblemService.issueProblemForToken(this.createTeacherPreviewProblemKey_(authToken), options || {}).publicProblem;
      problemElapsedMs = Date.now() - problemStartedAtMs;
      return problem;
    } finally {
      LoggerService.logDeveloperInfo(`getTeacherPreviewProblem elapsedMs=${Date.now() - startedAtMs} problemElapsedMs=${problemElapsedMs} mode=teacherPreview`);
    }
  }

  static submitTeacherPreviewAnswer(authToken, request) {
    const startedAtMs = Date.now();
    const timings = {
      storedProblemElapsedMs: 0,
      gradingElapsedMs: 0,
      nextProblemElapsedMs: 0
    };
    let attemptId = '';
    let skipNextProblem = false;
    try {
      AdminService.assertAdminAccess(authToken);
      const source = request || {};
      const submittedProblem = source.problem || {};
      const storedProblemStartedAtMs = Date.now();
      const problem = MolProblemService.getStoredProblemForToken(this.createTeacherPreviewProblemKey_(authToken), submittedProblem.attemptId);
      timings.storedProblemElapsedMs = Date.now() - storedProblemStartedAtMs;
      const submittedProblemId = String(submittedProblem.problemId || '').trim();
      if (submittedProblemId !== '' && submittedProblemId !== String(problem.problemId || '').trim()) {
        throw new Error('送信された問題IDと保存済み問題が一致しません。新しい問題を取得してください。');
      }
      const gradingStartedAtMs = Date.now();
      const grade = MolProblemService.gradeProblemAnswer(problem, source.submittedAnswer);
      timings.gradingElapsedMs = Date.now() - gradingStartedAtMs;
      const student = this.getTeacherPreviewStudent_();
      const entry = {
        timestamp: new Date().toISOString(),
        attemptId: String(problem.attemptId || ''),
        token: '',
        courseId: student.courseId,
        courseName: student.courseName,
        rosterKey: student.rosterKey,
        studentId: student.studentId,
        number: student.number,
        name: student.name,
        level: String(problem.level || source.level || ''),
        problemType: String(problem.problemType || ''),
        questionText: String(problem.questionText || ''),
        expectedAnswer: problem.expectedAnswer,
        submittedAnswer: String(source.submittedAnswer == null ? '' : source.submittedAnswer),
        normalizedSubmittedAnswer: grade.normalizedSubmittedAnswer,
        unit: String(problem.unit || ''),
        isCorrect: grade.isCorrect,
        tolerance: grade.tolerance,
        acceptedAnswerType: grade.acceptedAnswerType,
        acceptedAnswer: grade.acceptedAnswer,
        exactAnswer: grade.exactAnswer,
        significantDigits: problem.significantDigits || '',
        avogadroConstant: problem.avogadroConstant || '',
        requiresRounding: problem.requiresRounding === true,
        explanation: String(problem.explanation || ''),
        elapsedMs: Number(source.elapsedMs || 0),
        clientInfo: JSON.stringify(this.buildAnswerClientInfo_(source.clientInfo, grade))
      };
      attemptId = entry.attemptId;
      skipNextProblem = source.skipNextProblem === true;
      const nextProblemStartedAtMs = Date.now();
      const nextProblem = skipNextProblem
        ? null
        : MolProblemService.issueProblemForToken(this.createTeacherPreviewProblemKey_(authToken), {
          level: source.nextLevel || problem.level, category: source.category
        }).publicProblem;
      timings.nextProblemElapsedMs = Date.now() - nextProblemStartedAtMs;
      return this.buildSubmitAnswerResponse(entry, this.buildTeacherPreviewSummary_(student), nextProblem);
    } finally {
      LoggerService.logDeveloperInfo(`submitTeacherPreviewAnswer elapsedMs=${Date.now() - startedAtMs} storedProblemElapsedMs=${timings.storedProblemElapsedMs} gradingElapsedMs=${timings.gradingElapsedMs} nextProblemElapsedMs=${timings.nextProblemElapsedMs} mode=teacherPreview attemptId=${attemptId} skipNextProblem=${skipNextProblem}`);
    }
  }

  static createTeacherPreviewProblemKey_(authToken) {
    return `teacherPreview:${String(authToken || '').trim()}`;
  }

  static getTeacherPreviewStudent_(studentToken) {
    const normalizedToken = String(studentToken || '').trim();
    if (normalizedToken !== '') {
      const tokenRow = SheetRepository.findToken(normalizedToken);
      if (tokenRow) {
        return this.toPublicStudent_(tokenRow);
      }
    }
    return {
      courseId: 'teacher-preview',
      courseName: '教師プレビュー',
      rosterKey: 'teacher-preview::teacher',
      studentId: 'teacher-preview',
      number: '確認用',
      name: '先生'
    };
  }

  static buildTeacherPreviewSummary_(student) {
    return this.buildStudentSummaryFromAggregate_(student || this.getTeacherPreviewStudent_(), {});
  }

  static initializeStudentSession(token, options) {
    const startedAtMs = Date.now();
    let tokenRow = null;
    let tokenElapsedMs = 0;
    const tokenTimings = {
      tokenCacheReadElapsedMs: 0,
      tokenSheetFindElapsedMs: 0,
      tokenCacheWriteElapsedMs: 0
    };
    let summaryElapsedMs = 0;
    let adaptiveElapsedMs = 0;
    let problemElapsedMs = 0;
    let accessRecordStatus = 'skipped_student_runtime';
    try {
      const tokenStartedAtMs = Date.now();
      tokenRow = this.requireActiveToken_(token, tokenTimings);
      tokenElapsedMs = Date.now() - tokenStartedAtMs;
      const summaryStartedAtMs = Date.now();
      const summary = this.runtimeSummary_(tokenRow);
      summaryElapsedMs = Date.now() - summaryStartedAtMs;
      const issuedWithTiming = this.issueProblemForStudentWithTiming_(tokenRow, options || {});
      adaptiveElapsedMs = issuedWithTiming.adaptiveElapsedMs;
      problemElapsedMs = issuedWithTiming.problemElapsedMs;
      return {
        ok: true,
        student: this.toPublicStudent_(tokenRow),
        summary,
        problem: issuedWithTiming.issued.publicProblem
      };
    } finally {
      LoggerService.logDeveloperInfo(`initializeStudentSession elapsedMs=${Date.now() - startedAtMs} mode=student studentRoute=fast tokenElapsedMs=${tokenElapsedMs} tokenCacheReadElapsedMs=${tokenTimings.tokenCacheReadElapsedMs} tokenSheetFindElapsedMs=${tokenTimings.tokenSheetFindElapsedMs} tokenCacheWriteElapsedMs=${tokenTimings.tokenCacheWriteElapsedMs} accessRecord=${accessRecordStatus} summaryElapsedMs=${summaryElapsedMs} adaptiveElapsedMs=${adaptiveElapsedMs} problemElapsedMs=${problemElapsedMs} rosterKey=${tokenRow ? tokenRow.rosterKey : ''}`);
    }
  }

  static recordStudentAccess_(tokenRow) {
    if (typeof SpreadsheetApp === 'undefined') {
      return 'skipped_no_spreadsheet';
    }
    const token = String(tokenRow && tokenRow.token || '').trim();
    // lastAccessedAt更新は初回アクセス時に集中するため、短時間の再アクセスはスロットリングする。
    if (token === '' || this.hasRecentStudentAccessRecord_(token)) {
      return token === '' ? 'skipped_missing_token' : 'skipped_recent';
    }
    try {
      SheetRepository.withDocumentLock(() => {
        SheetRepository.recordTokenAccess(token, new Date().toISOString());
      });
      this.rememberStudentAccessRecord_(token);
      return 'recorded';
    } catch (error) {
      LoggerService.logDeveloperError(`Failed to record student access for ${tokenRow && tokenRow.rosterKey}`, error);
      return 'failed';
    }
  }

  static hasRecentStudentAccessRecord_(token) {
    const cache = this.getStudentAccessCache_();
    if (!cache) {
      return false;
    }
    try {
      return String(cache.get(this.createStudentAccessCacheKey_(token)) || '') !== '';
    } catch (_ignored) {
      return false;
    }
  }

  static rememberStudentAccessRecord_(token) {
    const cache = this.getStudentAccessCache_();
    if (!cache) {
      return;
    }
    try {
      cache.put(this.createStudentAccessCacheKey_(token), '1', 60 * 10);
    } catch (_ignored) {
      // Access recording is best-effort; cache failures must not block students.
    }
  }

  static getStudentAccessCache_() {
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        return CacheService.getScriptCache();
      }
    } catch (_ignored) {
      return null;
    }
    return null;
  }

  static createStudentAccessCacheKey_(token) {
    let hash = 2166136261;
    const source = `${String(token || '').trim()}|student-access-v1`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `studentAccess:${(hash >>> 0).toString(36)}`;
  }

  static getStudentLearningCheck(token, options) {
    const tokenRow=this.requireActiveToken_(token,{});
    const data=this.runtimeData_(tokenRow);
    return StudentLearningService.check_(data.learning,data.summary,options && options.level);
  }

  static getStudentState(token) {
    const tokenRow = this.requireActiveToken_(token, {});
    return {
      student: this.toPublicStudent_(tokenRow),
      summary: this.runtimeSummary_(tokenRow)
    };
  }

  static getPracticeProblem(token, options) {
    const startedAtMs = Date.now();
    let tokenRow = null;
    let tokenElapsedMs = 0;
    const tokenTimings = {
      tokenCacheReadElapsedMs: 0,
      tokenSheetFindElapsedMs: 0,
      tokenCacheWriteElapsedMs: 0
    };
    let adaptiveElapsedMs = 0;
    let problemElapsedMs = 0;
    try {
      const tokenStartedAtMs = Date.now();
      tokenRow = this.requireActiveToken_(token, tokenTimings);
      tokenElapsedMs = Date.now() - tokenStartedAtMs;
      const issuedWithTiming = this.issueProblemForStudentWithTiming_(tokenRow, options || {});
      adaptiveElapsedMs = issuedWithTiming.adaptiveElapsedMs;
      problemElapsedMs = issuedWithTiming.problemElapsedMs;
      return issuedWithTiming.issued.publicProblem;
    } finally {
      LoggerService.logDeveloperInfo(`getPracticeProblem elapsedMs=${Date.now() - startedAtMs} mode=student studentRoute=fast tokenElapsedMs=${tokenElapsedMs} tokenCacheReadElapsedMs=${tokenTimings.tokenCacheReadElapsedMs} tokenSheetFindElapsedMs=${tokenTimings.tokenSheetFindElapsedMs} tokenCacheWriteElapsedMs=${tokenTimings.tokenCacheWriteElapsedMs} adaptiveElapsedMs=${adaptiveElapsedMs} problemElapsedMs=${problemElapsedMs} rosterKey=${tokenRow ? tokenRow.rosterKey : ''}`);
    }
  }

  static firstSubmissionKey_(token, attemptId) {
    return 'firstSubmission:' + MolProblemService.createStoredProblemKey_(token, attemptId);
  }

  static markNewStudentAttempt_(tokenRow, issued) {
    // Called only immediately after generating a new UUID, never when restoring
    // a cached problem or retrying. Missing markers simply use the log lookup.
    try {
      const cache=this.getStudentAccessCache_();
      if(cache) cache.put(this.firstSubmissionKey_(tokenRow.token,issued.problem.attemptId),'fresh',1800);
    } catch (_) {}
  }

  static consumeFirstSubmission_(tokenRow, attemptId) {
    if(typeof CacheService==='undefined') return false;
    const cache=this.getStudentAccessCache_();
    if(!cache) throw new Error('保存の準備を確認できません。もう一度送信してください。');
    const key=this.firstSubmissionKey_(tokenRow.token,attemptId);
    if(cache.get(key)!=='fresh') return false;
    // Consume under the shared write lock BEFORE the first durable write.
    // On interruption a retry has no marker and must consult the durable log.
    // Never proceed to write if deletion failed: a surviving marker could let a
    // later request wrongly skip duplicate detection.
    cache.remove(key);
    if(cache.get(key)==='fresh') throw new Error('保存の準備を確認できません。もう一度送信してください。');
    return true;
  }

  static issueProblemForStudent_(tokenRow, options) {
    return this.issueProblemForStudentWithTiming_(tokenRow, options || {}).issued;
  }

  static issueProblemForStudentWithTiming_(tokenRow, options) {
    const sourceOptions = options || {};
    if(sourceOptions.practiceMode==='auto') {
      const started=Date.now();
      const issued=AutoPracticeService.issue_(tokenRow);
      this.markNewStudentAttempt_(tokenRow,issued);
      return {issued,adaptiveElapsedMs:Date.now()-started,problemElapsedMs:0};
    }
    const adaptiveElapsedMs = 0;
    const issueOptions = {
      ...sourceOptions,
      level: MolProblemService.normalizeLevel_(sourceOptions.level)
    };
    const problemStartedAtMs = Date.now();
    const issued = MolProblemService.issueProblemForToken(tokenRow.token, issueOptions);
    this.markNewStudentAttempt_(tokenRow,issued);
    const problemElapsedMs = Date.now() - problemStartedAtMs;
    return {
      issued,
      adaptiveElapsedMs,
      problemElapsedMs
    };
  }

  static submitAnswer(request) {
    const startedAtMs = Date.now();
    let tokenRow = null;
    let attemptId = '';
    let duplicate = false;
    let cacheUpdated = false;
    let problemTypeCacheUpdated = false;
    let aggregatePath = 'deferred_aggregate_update';
    let deferredSummaryUpdate = false;
    let nextProblemIncluded = false;
    const tokenTimings = {
      tokenCacheReadElapsedMs: 0,
      tokenSheetFindElapsedMs: 0,
      tokenCacheWriteElapsedMs: 0
    };
    const timings = {
      tokenElapsedMs: 0,
      storedProblemElapsedMs: 0,
      gradingElapsedMs: 0,
      lockElapsedMs: 0,
      lockWaitElapsedMs: 0,
      summaryElapsedMs: 0,
      appendLogElapsedMs: 0,
      duplicateCheckElapsedMs: 0,
      appendOnlyElapsedMs: 0,
      documentLockWaitAndRunElapsedMs: 0,
      aggregateUpdateElapsedMs: 0,
      problemTypeCacheUpdateElapsedMs: 0,
      nextProblemElapsedMs: 0
    };
    try {
      const tokenStartedAtMs = Date.now();
      tokenRow = this.requireActiveToken_(request && request.token, tokenTimings);
      timings.tokenElapsedMs = Date.now() - tokenStartedAtMs;
      const submittedProblem = request.problem || {};
      const storedProblemStartedAtMs = Date.now();
      const problem = MolProblemService.getStoredProblemForToken(tokenRow.token, submittedProblem.attemptId);
      timings.storedProblemElapsedMs = Date.now() - storedProblemStartedAtMs;
      const submittedProblemId = String(submittedProblem.problemId || '').trim();
      if (submittedProblemId !== '' && submittedProblemId !== String(problem.problemId || '').trim()) {
        throw new Error('送信された問題IDと保存済み問題が一致しません。新しい問題を取得してください。');
      }
      const gradingStartedAtMs = Date.now();
      const grade = MolProblemService.gradeProblemAnswer(problem, request.submittedAnswer);
      timings.gradingElapsedMs = Date.now() - gradingStartedAtMs;
      const now = new Date().toISOString();
      const entry = {
        timestamp: now,
        attemptId: String(problem.attemptId || ''),
        token: tokenRow.token,
        courseId: tokenRow.courseId,
        courseName: tokenRow.courseName,
        rosterKey: tokenRow.rosterKey,
        studentId: tokenRow.studentId,
        number: tokenRow.number,
        name: tokenRow.name,
        level: String(problem.level || request.level || ''),
        problemType: String(problem.problemType || ''),
        questionText: String(problem.questionText || ''),
        expectedAnswer: problem.expectedAnswer,
        submittedAnswer: String(request.submittedAnswer == null ? '' : request.submittedAnswer),
        normalizedSubmittedAnswer: grade.normalizedSubmittedAnswer,
        unit: String(problem.unit || ''),
        isCorrect: grade.isCorrect,
        tolerance: grade.tolerance,
        acceptedAnswerType: grade.acceptedAnswerType,
        acceptedAnswer: grade.acceptedAnswer,
        exactAnswer: grade.exactAnswer,
        significantDigits: problem.significantDigits || '',
        avogadroConstant: problem.avogadroConstant || '',
        requiresRounding: problem.requiresRounding === true,
        explanation: String(problem.explanation || ''),
        elapsedMs: Number(request.elapsedMs || 0),
        clientInfo: JSON.stringify(this.buildAnswerClientInfo_(request.clientInfo, grade, problem.autoPractice))
      };
      attemptId = entry.attemptId;
      let logEntry = entry;
      let summary = null;
      const lockStartedAtMs = Date.now();
      try {
        SheetRepository.withDocumentLock(() => {
          timings.lockWaitElapsedMs = Date.now() - lockStartedAtMs;
          const duplicateCheckStartedAtMs = Date.now();
          // 同じattemptIdの再送は既存ログを返し、解答ログを二重に増やさない。
          const existingLog = this.consumeFirstSubmission_(tokenRow,entry.attemptId)
            ? null : SheetRepository.findAnswerLogByAttemptId(entry.rosterKey, entry.attemptId);
          timings.duplicateCheckElapsedMs += Date.now() - duplicateCheckStartedAtMs;
          if (existingLog) {
            logEntry = this.toEntryFromExistingLog_(existingLog);
            duplicate = true;
          } else {
            const appendOnlyStartedAtMs = Date.now();
            SheetRepository.appendAnswerLog(entry);
            timings.appendOnlyElapsedMs += Date.now() - appendOnlyStartedAtMs;
          }
          const summaryStartedAtMs = Date.now();
          summary = this.updateRuntimeSummary_(tokenRow, logEntry, duplicate);
          timings.summaryElapsedMs = Date.now() - summaryStartedAtMs;
          timings.appendLogElapsedMs += timings.duplicateCheckElapsedMs + timings.appendOnlyElapsedMs;
        });
      } catch (error) {
        // A write/flush failure has an uncertain outcome. Retry reconstructs
        // from the durable log instead of displaying a possibly ahead cache.
        try { const cache=this.getStudentAccessCache_(); if(cache) cache.remove(this.runtimeSummaryKey_(tokenRow)); } catch (_) {}
        throw error;
      } finally {
        timings.lockElapsedMs = Date.now() - lockStartedAtMs;
        timings.documentLockWaitAndRunElapsedMs = timings.lockElapsedMs;
      }
      // Summary was updated under the same lock as the authoritative log append.
      deferredSummaryUpdate = true;
      const nextStarted=Date.now();
      const nextProblem = problem.autoPractice
        ? this.issueProblemForStudent_(tokenRow,{practiceMode:'auto'}).publicProblem : null;
      timings.nextProblemElapsedMs=Date.now()-nextStarted;
      nextProblemIncluded = !!nextProblem;
      return {
        ...this.buildSubmitAnswerResponse(logEntry, summary, nextProblem),
        duplicate,
        deferredSummaryUpdate,
        performance: {
          serverElapsedMs: Date.now() - startedAtMs,
          tokenElapsedMs: timings.tokenElapsedMs,
          storedProblemElapsedMs: timings.storedProblemElapsedMs,
          gradingElapsedMs: timings.gradingElapsedMs,
          lockWaitElapsedMs: timings.lockWaitElapsedMs,
          lockElapsedMs: timings.lockElapsedMs,
          duplicateCheckElapsedMs: timings.duplicateCheckElapsedMs,
          appendOnlyElapsedMs: timings.appendOnlyElapsedMs,
          summaryElapsedMs: timings.summaryElapsedMs,
          nextProblemElapsedMs: timings.nextProblemElapsedMs
        }
      };
    } finally {
      LoggerService.logDeveloperInfo(`submitAnswer elapsedMs=${Date.now() - startedAtMs} mode=student studentRoute=fast tokenElapsedMs=${timings.tokenElapsedMs} tokenCacheReadElapsedMs=${tokenTimings.tokenCacheReadElapsedMs} tokenSheetFindElapsedMs=${tokenTimings.tokenSheetFindElapsedMs} tokenCacheWriteElapsedMs=${tokenTimings.tokenCacheWriteElapsedMs} storedProblemElapsedMs=${timings.storedProblemElapsedMs} gradingElapsedMs=${timings.gradingElapsedMs} lockElapsedMs=${timings.lockElapsedMs} documentLockWaitAndRunElapsedMs=${timings.documentLockWaitAndRunElapsedMs} appendLogElapsedMs=${timings.appendLogElapsedMs} duplicateCheckElapsedMs=${timings.duplicateCheckElapsedMs} appendOnlyElapsedMs=${timings.appendOnlyElapsedMs} aggregateUpdateElapsedMs=${timings.aggregateUpdateElapsedMs} problemTypeCacheUpdateElapsedMs=${timings.problemTypeCacheUpdateElapsedMs} nextProblemElapsedMs=${timings.nextProblemElapsedMs} nextProblemIncluded=${nextProblemIncluded} rosterKey=${tokenRow ? tokenRow.rosterKey : ''} attemptId=${attemptId} duplicate=${duplicate} aggregatePath=${aggregatePath} cacheUpdated=${cacheUpdated} problemTypeCacheUpdated=${problemTypeCacheUpdated}`);
    }
  }

  static readLatestAnswerLogsForRosterKeySafely_(rosterKey, fallbackEntry) {
    try {
      return SheetRepository.readLatestAnswerLogsForRosterKey(rosterKey, 10);
    } catch (error) {
      LoggerService.logDeveloperError(`Failed to read latest answer logs for ${rosterKey}`, error);
      return fallbackEntry ? [fallbackEntry] : [];
    }
  }

  static readLatestProblemTypeLogsSafely_(entry) {
    try {
      return SheetRepository.readLatestAnswerLogsForRosterKeyLevelProblemType(entry.rosterKey, entry.level, entry.problemType, 10);
    } catch (error) {
      LoggerService.logDeveloperError(`Failed to read latest problem type logs for ${entry.rosterKey}/${entry.level}/${entry.problemType}`, error);
      return entry ? [entry] : [];
    }
  }

  static updateProblemTypeStatsCacheAfterAppend_(tokenRow, entry, fullRosterRows) {
    const normalizedRosterKey = String(entry && entry.rosterKey || '').trim();
    const normalizedLevel = String(entry && entry.level || '').trim();
    const normalizedProblemType = String(entry && entry.problemType || '').trim();
    if (normalizedRosterKey === '' || normalizedLevel === '' || normalizedProblemType === '') {
      return false;
    }
    try {
      const existingRow = SheetRepository.findProblemTypeStatsRow(normalizedRosterKey, normalizedLevel, normalizedProblemType);
      if (existingRow) {
        const recentRows = this.readLatestProblemTypeLogsSafely_(entry);
        const row = this.buildFastProblemTypeStatsRow_(tokenRow, existingRow, entry, recentRows);
        SheetRepository.upsertProblemTypeStatsRow(row);
        return true;
      }
      const sourceRows = Array.isArray(fullRosterRows)
        ? fullRosterRows
        : SheetRepository.readAnswerLogsForRosterKey(normalizedRosterKey);
      const rows = AggregationService.buildProblemTypeStatsRows(sourceRows, new Date().toISOString())
        .filter((row) => row.rosterKey === normalizedRosterKey);
      rows.forEach((row) => SheetRepository.upsertProblemTypeStatsRow(row));
      return rows.length > 0;
    } catch (error) {
      LoggerService.logDeveloperError(`Failed to update problem type stats cache for ${normalizedRosterKey}/${normalizedLevel}/${normalizedProblemType}`, error);
      return false;
    }
  }

  static buildFastProblemTypeStatsRow_(tokenRow, cacheRow, entry, recentRows) {
    const base = this.buildProblemTypeStatsFromCache_(tokenRow, cacheRow || {});
    const previousAttempts = Number(base.attempts || 0);
    const attempts = previousAttempts + 1;
    const correct = Number(base.correct || 0) + (entry.isCorrect === true ? 1 : 0);
    const recentSummary = this.summarizeProblemTypeStatsRows_(recentRows || []);
    const elapsedMs = Number(entry.elapsedMs || 0);
    const hasValidElapsed = this.isValidElapsedMs_(elapsedMs);
    const elapsedCount = Number(base.elapsedCount || 0) + (hasValidElapsed ? 1 : 0);
    const averageElapsedMs = hasValidElapsed
      ? this.incrementAverage_(Number(base.averageElapsedMs || 0), Number(base.elapsedCount || 0), elapsedMs)
      : Number(base.averageElapsedMs || 0);
    return {
      updatedAt: new Date().toISOString(),
      courseId: tokenRow.courseId,
      courseName: tokenRow.courseName,
      rosterKey: tokenRow.rosterKey,
      studentId: tokenRow.studentId,
      number: tokenRow.number,
      name: tokenRow.name,
      level: String(entry.level || ''),
      problemType: String(entry.problemType || ''),
      attempts,
      correct,
      accuracy: this.roundRate_(correct, attempts),
      recentAttempts: recentSummary.attempts,
      recentCorrect: recentSummary.correct,
      recentAccuracy: recentSummary.accuracy,
      averageElapsedMs,
      elapsedCount,
      recentAverageElapsedMs: recentSummary.averageElapsedMs,
      lastAnsweredAt: recentSummary.lastAnsweredAt || String(entry.timestamp || ''),
      lastIsCorrect: entry.isCorrect === true,
      lastElapsedMs: recentSummary.lastElapsedMs || (this.isValidElapsedMs_(elapsedMs) ? elapsedMs : Number(base.lastElapsedMs || 0))
    };
  }

  static buildProblemTypeStatsFromCache_(tokenRow, cacheRow) {
    const row = cacheRow || {};
    return {
      updatedAt: String(row.updatedAt || ''),
      courseId: String(tokenRow.courseId || row.courseId || ''),
      courseName: String(tokenRow.courseName || row.courseName || ''),
      rosterKey: String(tokenRow.rosterKey || row.rosterKey || ''),
      studentId: String(tokenRow.studentId || row.studentId || ''),
      number: String(tokenRow.number || row.number || ''),
      name: String(tokenRow.name || row.name || ''),
      level: String(row.level || ''),
      problemType: String(row.problemType || ''),
      attempts: this.numberOrZero_(row.attempts),
      correct: this.numberOrZero_(row.correct),
      accuracy: this.numberOrZero_(row.accuracy),
      recentAttempts: this.numberOrZero_(row.recentAttempts),
      recentCorrect: this.numberOrZero_(row.recentCorrect),
      recentAccuracy: this.numberOrZero_(row.recentAccuracy),
      averageElapsedMs: this.numberOrZero_(row.averageElapsedMs),
      elapsedCount: this.numberOrZero_(row.elapsedCount),
      recentAverageElapsedMs: this.numberOrZero_(row.recentAverageElapsedMs),
      lastAnsweredAt: String(row.lastAnsweredAt || ''),
      lastIsCorrect: row.lastIsCorrect === true,
      lastElapsedMs: this.numberOrZero_(row.lastElapsedMs)
    };
  }

  static buildStudentAnswerSummaryFromLogs_(tokenRow, logs) {
    const summary = this.summarizeAnswerLogsForStudent(tokenRow.rosterKey, logs);
    return {
      updatedAt: new Date().toISOString(),
      courseId: tokenRow.courseId,
      courseName: tokenRow.courseName,
      rosterKey: tokenRow.rosterKey,
      studentId: tokenRow.studentId,
      number: tokenRow.number,
      name: tokenRow.name,
      ...summary
    };
  }

  static buildFastStudentAnswerSummary_(tokenRow, aggregateRow, entry, recentRows, appended) {
    const recentSummary = this.summarizeAnswerLogsForStudent(tokenRow.rosterKey, recentRows || []);
    if (!aggregateRow) {
      return {
        updatedAt: new Date().toISOString(),
        courseId: tokenRow.courseId,
        courseName: tokenRow.courseName,
        rosterKey: tokenRow.rosterKey,
        studentId: tokenRow.studentId,
        number: tokenRow.number,
        name: tokenRow.name,
        ...recentSummary
      };
    }

    const base = this.buildStudentSummaryFromAggregate_(tokenRow, aggregateRow);
    const previousAttempts = Number(base.totalAttempts || 0);
    const previousCorrect = Number(base.totalCorrect || 0);
    const nextAttempts = previousAttempts + (appended ? 1 : 0);
    const nextCorrect = previousCorrect + (appended && entry.isCorrect === true ? 1 : 0);
    const levelMetrics = this.incrementLevelMetricsFromAggregate_(base, entry, appended, recentSummary);
    const elapsedMetrics = this.incrementElapsedMetricsFromAggregate_(base, entry, appended, previousAttempts, previousCorrect, nextAttempts, nextCorrect, recentSummary, (recentRows || []).length);

    return {
      updatedAt: new Date().toISOString(),
      courseId: tokenRow.courseId,
      courseName: tokenRow.courseName,
      rosterKey: tokenRow.rosterKey,
      studentId: tokenRow.studentId,
      number: tokenRow.number,
      name: tokenRow.name,
      totalAttempts: nextAttempts,
      totalCorrect: nextCorrect,
      totalAccuracy: this.roundRate_(nextCorrect, nextAttempts),
      recent10Attempts: recentSummary.recent10Attempts,
      recent10Correct: recentSummary.recent10Correct,
      recent10Accuracy: recentSummary.recent10Accuracy,
      currentCorrectStreak: recentSummary.currentCorrectStreak,
      ...levelMetrics,
      lastAnsweredAt: recentSummary.lastAnsweredAt || base.lastAnsweredAt || '',
      lastLevel: recentSummary.lastLevel || base.lastLevel || '',
      lastProblemType: recentSummary.lastProblemType || base.lastProblemType || '',
      ...elapsedMetrics
    };
  }

  static buildStudentRuntimeApproxSummary_(tokenRow, aggregateRow, entry, appended) {
    const base = this.buildStudentSummaryFromAggregate_(tokenRow, aggregateRow || {});
    const shouldAppend = appended === true;
    const isCorrect = entry && entry.isCorrect === true;
    const correctIncrement = shouldAppend && isCorrect ? 1 : 0;
    const previousAttempts = Number(base.totalAttempts || 0);
    const previousCorrect = Number(base.totalCorrect || 0);
    const nextAttempts = previousAttempts + (shouldAppend ? 1 : 0);
    const nextCorrect = previousCorrect + correctIncrement;
    const previousRecentAttempts = Number(base.recent10Attempts || 0);
    const previousRecentCorrect = Number(base.recent10Correct || 0);
    const recent10Attempts = shouldAppend
      ? Math.min(10, previousRecentAttempts + 1)
      : Math.min(10, previousRecentAttempts);
    const recent10Correct = shouldAppend
      ? Math.min(recent10Attempts, previousRecentCorrect + correctIncrement)
      : Math.min(recent10Attempts, previousRecentCorrect);
    const levelMetrics = this.incrementApproxLevelMetricsFromAggregate_(base, entry, shouldAppend, recent10Attempts);
    const elapsedMetrics = this.incrementApproxElapsedMetricsFromAggregate_(
      base,
      entry,
      shouldAppend,
      previousAttempts,
      previousCorrect,
      nextAttempts,
      nextCorrect,
      previousRecentAttempts,
      previousRecentCorrect,
      recent10Attempts,
      recent10Correct
    );

    return {
      updatedAt: new Date().toISOString(),
      courseId: tokenRow.courseId,
      courseName: tokenRow.courseName,
      rosterKey: tokenRow.rosterKey,
      studentId: tokenRow.studentId,
      number: tokenRow.number,
      name: tokenRow.name,
      totalAttempts: nextAttempts,
      totalCorrect: nextCorrect,
      totalAccuracy: this.roundRate_(nextCorrect, nextAttempts),
      recent10Attempts,
      recent10Correct,
      recent10Accuracy: this.roundRate_(recent10Correct, recent10Attempts),
      currentCorrectStreak: shouldAppend ? (isCorrect ? Number(base.currentCorrectStreak || 0) + 1 : 0) : Number(base.currentCorrectStreak || 0),
      ...levelMetrics,
      lastAnsweredAt: shouldAppend ? String(entry.timestamp || base.lastAnsweredAt || '') : String(base.lastAnsweredAt || ''),
      lastLevel: shouldAppend ? String(entry.level || base.lastLevel || '') : String(base.lastLevel || ''),
      lastProblemType: shouldAppend ? String(entry.problemType || base.lastProblemType || '') : String(base.lastProblemType || ''),
      ...elapsedMetrics
    };
  }

  static incrementApproxLevelMetricsFromAggregate_(base, entry, appended, recent10Attempts) {
    const output = {};
    const entryLevel = String(entry && entry.level || '').trim();
    ['beginner', 'intermediate', 'advanced', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6'].forEach((level) => {
      const key = `${level[0].toUpperCase()}${level.slice(1)}`;
      const attemptKey = `${level}Attempts`;
      const correctKey = `${level}Correct`;
      const accuracyKey = `${level}Accuracy`;
      const recentAttemptKey = `recent10${key}Attempts`;
      const matchesLevel = appended && entryLevel === level;
      const attempts = Number(base[attemptKey] || 0) + (matchesLevel ? 1 : 0);
      const correct = Number(base[correctKey] || 0) + (matchesLevel && entry.isCorrect === true ? 1 : 0);
      output[attemptKey] = attempts;
      output[correctKey] = correct;
      output[accuracyKey] = this.roundRate_(correct, attempts);
      output[recentAttemptKey] = matchesLevel
        ? Math.min(Number(recent10Attempts || 0), Number(base[recentAttemptKey] || 0) + 1)
        : Math.min(Number(recent10Attempts || 0), Number(base[recentAttemptKey] || 0));
    });
    return output;
  }

  static incrementApproxElapsedMetricsFromAggregate_(base, entry, appended, previousAttempts, previousCorrect, nextAttempts, nextCorrect, previousRecentAttempts, previousRecentCorrect, recent10Attempts, recent10Correct) {
    const elapsedMs = Number(entry && entry.elapsedMs || 0);
    const hasValidElapsed = this.isValidElapsedMs_(elapsedMs);
    const averageElapsedMs = appended && hasValidElapsed
      ? this.incrementAverage_(Number(base.averageElapsedMs || 0), previousAttempts, elapsedMs)
      : Number(base.averageElapsedMs || 0);
    const recentBaseCount = Math.min(9, Number(previousRecentAttempts || 0));
    const recent10AverageElapsedMs = appended && hasValidElapsed
      ? this.incrementAverage_(Number(base.recent10AverageElapsedMs || 0), recentBaseCount, elapsedMs)
      : Number(base.recent10AverageElapsedMs || 0);
    const correctAverageElapsedMs = appended && entry && entry.isCorrect === true && hasValidElapsed
      ? this.incrementAverage_(Number(base.correctAverageElapsedMs || 0), previousCorrect, elapsedMs)
      : Number(base.correctAverageElapsedMs || 0);
    const correctRecentBaseCount = Math.min(9, Number(previousRecentCorrect || 0));
    const correctRecent10AverageElapsedMs = appended && entry && entry.isCorrect === true && hasValidElapsed
      ? this.incrementAverage_(Number(base.correctRecent10AverageElapsedMs || 0), correctRecentBaseCount, elapsedMs)
      : Number(base.correctRecent10AverageElapsedMs || 0);
    const first10AverageElapsedMs = appended && hasValidElapsed && nextAttempts <= 10
      ? this.incrementAverage_(Number(base.first10AverageElapsedMs || 0), previousAttempts, elapsedMs)
      : Number(base.first10AverageElapsedMs || 0);

    return {
      averageElapsedMs,
      medianElapsedMs: Number(base.medianElapsedMs || 0),
      recent10AverageElapsedMs: recent10Attempts > 0 ? recent10AverageElapsedMs : 0,
      recent10MedianElapsedMs: Number(base.recent10MedianElapsedMs || 0),
      correctAverageElapsedMs: nextCorrect > 0 ? correctAverageElapsedMs : 0,
      correctRecent10AverageElapsedMs: recent10Correct > 0 ? correctRecent10AverageElapsedMs : 0,
      first10AverageElapsedMs,
      speedImprovementRate: first10AverageElapsedMs > 0 && recent10AverageElapsedMs > 0
        ? this.roundDecimal_((first10AverageElapsedMs - recent10AverageElapsedMs) / first10AverageElapsedMs, 4)
        : 0,
      lastElapsedMs: appended && hasValidElapsed ? elapsedMs : Number(base.lastElapsedMs || 0)
    };
  }

  static incrementLevelMetricsFromAggregate_(base, entry, appended, recentSummary) {
    const output = {};
    ['beginner', 'intermediate', 'advanced', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6'].forEach((level) => {
      const key = `${level[0].toUpperCase()}${level.slice(1)}`;
      const attemptKey = `${level}Attempts`;
      const correctKey = `${level}Correct`;
      const accuracyKey = `${level}Accuracy`;
      const attempts = Number(base[attemptKey] || 0) + (appended && String(entry.level || '') === level ? 1 : 0);
      const correct = Number(base[correctKey] || 0) + (appended && String(entry.level || '') === level && entry.isCorrect === true ? 1 : 0);
      output[attemptKey] = attempts;
      output[correctKey] = correct;
      output[accuracyKey] = this.roundRate_(correct, attempts);
      output[`recent10${key}Attempts`] = Number(recentSummary[`recent10${key}Attempts`] || 0);
    });
    return output;
  }

  static incrementElapsedMetricsFromAggregate_(base, entry, appended, previousAttempts, previousCorrect, nextAttempts, nextCorrect, recentSummary, recentRowCount) {
    const previousAverageElapsedMs = Number(base.averageElapsedMs || 0);
    const previousCorrectAverageElapsedMs = Number(base.correctAverageElapsedMs || 0);
    const elapsedMs = Number(entry.elapsedMs || 0);
    const hasValidElapsed = this.isValidElapsedMs_(elapsedMs);
    const averageElapsedMs = appended && hasValidElapsed
      ? this.incrementAverage_(previousAverageElapsedMs, previousAttempts, elapsedMs)
      : previousAverageElapsedMs;
    const correctAverageElapsedMs = appended && entry.isCorrect === true && hasValidElapsed
      ? this.incrementAverage_(previousCorrectAverageElapsedMs, previousCorrect, elapsedMs)
      : previousCorrectAverageElapsedMs;
    const first10AverageElapsedMs = appended && nextAttempts <= 10
      ? recentSummary.averageElapsedMs
      : Number(base.first10AverageElapsedMs || 0);
    const recent10AverageElapsedMs = Number(recentSummary.recent10AverageElapsedMs || 0);

    return {
      averageElapsedMs,
      medianElapsedMs: nextAttempts <= Number(recentRowCount || 0) ? Number(recentSummary.medianElapsedMs || 0) : Number(base.medianElapsedMs || 0),
      recent10AverageElapsedMs,
      recent10MedianElapsedMs: Number(recentSummary.recent10MedianElapsedMs || 0),
      correctAverageElapsedMs: nextCorrect > 0 ? correctAverageElapsedMs : 0,
      correctRecent10AverageElapsedMs: Number(recentSummary.correctRecent10AverageElapsedMs || 0),
      first10AverageElapsedMs,
      speedImprovementRate: first10AverageElapsedMs > 0 && recent10AverageElapsedMs > 0
        ? this.roundDecimal_((first10AverageElapsedMs - recent10AverageElapsedMs) / first10AverageElapsedMs, 4)
        : 0,
      lastElapsedMs: Number(recentSummary.lastElapsedMs || base.lastElapsedMs || 0)
    };
  }

  static incrementAverage_(previousAverage, previousCount, nextValue) {
    const count = Number(previousCount || 0);
    if (count <= 0) {
      return Math.round(Number(nextValue || 0));
    }
    return Math.round(((Number(previousAverage || 0) * count) + Number(nextValue || 0)) / (count + 1));
  }

  static summarizeAnswerLogsForStudent(rosterKey, logs) {
    const normalizedRosterKey = String(rosterKey || '').trim();
    const rows = (logs || [])
      .filter((row) => String(row.rosterKey || '').trim() === normalizedRosterKey)
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    const recentRows = rows.slice(-10);
    const totalCorrect = rows.filter((row) => row.isCorrect === true).length;
    const recentCorrect = recentRows.filter((row) => row.isCorrect === true).length;
    const latest = rows[rows.length - 1] || {};
    const levelMetrics = this.summarizeLevelMetrics_(rows, recentRows);
    let currentCorrectStreak = 0;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].isCorrect !== true) {
        break;
      }
      currentCorrectStreak += 1;
    }
    return {
      totalAttempts: rows.length,
      totalCorrect,
      totalAccuracy: this.roundRate_(totalCorrect, rows.length),
      recent10Attempts: recentRows.length,
      recent10Correct: recentCorrect,
      recent10Accuracy: this.roundRate_(recentCorrect, recentRows.length),
      currentCorrectStreak,
      ...levelMetrics,
      lastAnsweredAt: String(latest.timestamp || ''),
      lastLevel: String(latest.level || ''),
      lastProblemType: String(latest.problemType || ''),
      ...this.summarizeElapsedMetrics_(rows)
    };
  }

  static summarizeProblemTypeStatsRows_(logs) {
    const rows = (logs || [])
      .slice()
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    const recentRows = rows.slice(-10);
    const correct = rows.filter((row) => row.isCorrect === true).length;
    const recentCorrect = recentRows.filter((row) => row.isCorrect === true).length;
    const latest = rows[rows.length - 1] || {};
    const elapsedCount = this.validElapsedMsValues_(rows).length;
    return {
      attempts: rows.length,
      correct,
      accuracy: this.roundRate_(correct, rows.length),
      recentAttempts: recentRows.length,
      recentCorrect,
      recentAccuracy: this.roundRate_(recentCorrect, recentRows.length),
      averageElapsedMs: this.averageElapsedMs_(rows),
      elapsedCount,
      recentAverageElapsedMs: this.averageElapsedMs_(recentRows),
      lastAnsweredAt: String(latest.timestamp || ''),
      lastIsCorrect: latest.isCorrect === true,
      lastElapsedMs: this.lastValidElapsedMs_(rows)
    };
  }

  static summarizeLevelMetrics_(rows, recentRows) {
    return {
      ...this.summarizeSingleLevelMetrics_(rows, recentRows, 'beginner'),
      ...this.summarizeSingleLevelMetrics_(rows, recentRows, 'intermediate'),
      ...this.summarizeSingleLevelMetrics_(rows, recentRows, 'advanced'),
      ...Object.assign({}, ...['lv1','lv2','lv3','lv4','lv5','lv6'].map(level => this.summarizeSingleLevelMetrics_(rows, recentRows, level)))
    };
  }

  static summarizeSingleLevelMetrics_(rows, recentRows, level) {
    const key = `${level[0].toUpperCase()}${level.slice(1)}`;
    const levelRows = (rows || []).filter((row) => String(row.level || '') === level);
    const correct = levelRows.filter((row) => row.isCorrect === true).length;
    const recentAttempts = (recentRows || []).filter((row) => String(row.level || '') === level).length;
    return {
      [`${level}Attempts`]: levelRows.length,
      [`${level}Correct`]: correct,
      [`${level}Accuracy`]: this.roundRate_(correct, levelRows.length),
      [`recent10${key}Attempts`]: recentAttempts
    };
  }

  static summarizeElapsedMetrics_(rows) {
    const recentRows = rows.slice(-10);
    const firstRows = rows.slice(0, 10);
    const averageElapsedMs = this.averageElapsedMs_(rows);
    const recent10AverageElapsedMs = this.averageElapsedMs_(recentRows);
    const first10AverageElapsedMs = this.averageElapsedMs_(firstRows);
    return {
      averageElapsedMs,
      medianElapsedMs: this.medianElapsedMs_(rows),
      recent10AverageElapsedMs,
      recent10MedianElapsedMs: this.medianElapsedMs_(recentRows),
      correctAverageElapsedMs: this.averageElapsedMs_(rows.filter((row) => row.isCorrect === true)),
      correctRecent10AverageElapsedMs: this.averageElapsedMs_(recentRows.filter((row) => row.isCorrect === true)),
      first10AverageElapsedMs,
      speedImprovementRate: first10AverageElapsedMs > 0 && recent10AverageElapsedMs > 0
        ? this.roundDecimal_((first10AverageElapsedMs - recent10AverageElapsedMs) / first10AverageElapsedMs, 4)
        : 0,
      lastElapsedMs: this.lastValidElapsedMs_(rows)
    };
  }

  static averageElapsedMs_(rows) {
    const values = this.validElapsedMsValues_(rows);
    if (values.length === 0) {
      return 0;
    }
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  static medianElapsedMs_(rows) {
    const values = this.validElapsedMsValues_(rows).sort((a, b) => a - b);
    if (values.length === 0) {
      return 0;
    }
    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 1) {
      return values[middle];
    }
    return Math.round((values[middle - 1] + values[middle]) / 2);
  }

  static lastValidElapsedMs_(rows) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const elapsedMs = Number(rows[index].elapsedMs);
      if (this.isValidElapsedMs_(elapsedMs)) {
        return elapsedMs;
      }
    }
    return 0;
  }

  static validElapsedMsValues_(rows) {
    return (rows || [])
      .map((row) => Number(row.elapsedMs))
      .filter((elapsedMs) => this.isValidElapsedMs_(elapsedMs));
  }

  static isValidElapsedMs_(elapsedMs) {
    return Number.isFinite(elapsedMs) && elapsedMs >= 500 && elapsedMs <= 30 * 60 * 1000;
  }

  static buildSubmitAnswerResponse(entry, summary, nextProblem) {
    return {
      ok: true,
      result: {
        isCorrect: entry.isCorrect === true,
        expectedAnswerText: this.formatAnswerText_(entry.expectedAnswer, entry.unit, entry.significantDigits, entry.level),
        submittedAnswerText: `${String(entry.submittedAnswer || '').replace(/e\+?(-?\d+)/i, '×10^$1')} ${String(entry.unit || '')}`.trim(),
        acceptedAnswerType: String(entry.acceptedAnswerType || ''),
        exactAnswerText: Number.isFinite(Number(entry.exactAnswer))
          ? this.formatAnswerText_(entry.exactAnswer, entry.unit, entry.significantDigits, entry.level)
          : '',
        explanation: String(entry.explanation || ''),
        explanationHtml: MolProblemService.formatChemicalTextHtml_(entry.explanation),
        totalAttempts: Number(summary.totalAttempts || 0),
        totalCorrect: Number(summary.totalCorrect || 0),
        totalAccuracy: Number(summary.totalAccuracy || 0),
        recent10Attempts: Number(summary.recent10Attempts || 0),
        recent10Correct: Number(summary.recent10Correct || 0),
        recent10Accuracy: Number(summary.recent10Accuracy || 0),
        currentCorrectStreak: Number(summary.currentCorrectStreak || 0),
        level: String(entry.level || ''),
        problemType: String(entry.problemType || ''),
        significantDigits: Number(entry.significantDigits || 0),
        requiresRounding: entry.requiresRounding === true
      },
      nextProblem
    };
  }

  static hasDuplicateAttempt(rosterKey, attemptId, logs) {
    const normalizedRosterKey = String(rosterKey || '').trim();
    const normalizedAttemptId = String(attemptId || '').trim();
    if (normalizedRosterKey === '' || normalizedAttemptId === '') {
      return false;
    }
    return (logs || []).some((row) => String(row.rosterKey || '').trim() === normalizedRosterKey && String(row.attemptId || '').trim() === normalizedAttemptId);
  }

  static getStudentAnswerSummaryFromCache_(tokenRow) {
    const cached = SheetRepository.findAggregateCacheByRosterKey(tokenRow.rosterKey);
    return this.buildStudentSummaryFromAggregate_(tokenRow, cached || {});
  }

  static buildStudentSummaryFromAggregate_(tokenRow, aggregateRow) {
    const row = aggregateRow || {};
    return {
      updatedAt: String(row.updatedAt || ''),
      courseId: String(tokenRow.courseId || ''),
      courseName: String(tokenRow.courseName || ''),
      rosterKey: String(tokenRow.rosterKey || ''),
      studentId: String(tokenRow.studentId || ''),
      number: String(tokenRow.number || ''),
      name: String(tokenRow.name || ''),
      totalAttempts: this.numberOrZero_(row.totalAttempts),
      totalCorrect: this.numberOrZero_(row.totalCorrect),
      totalAccuracy: this.numberOrZero_(row.totalAccuracy),
      recent10Attempts: this.numberOrZero_(row.recent10Attempts),
      recent10Correct: this.numberOrZero_(row.recent10Correct),
      recent10Accuracy: this.numberOrZero_(row.recent10Accuracy),
      currentCorrectStreak: this.numberOrZero_(row.currentCorrectStreak),
      ...MolProblemService.practiceLevelMetrics_(row),
      beginnerAttempts: this.numberOrZero_(row.beginnerAttempts),
      beginnerCorrect: this.numberOrZero_(row.beginnerCorrect),
      beginnerAccuracy: this.numberOrZero_(row.beginnerAccuracy),
      intermediateAttempts: this.numberOrZero_(row.intermediateAttempts),
      intermediateCorrect: this.numberOrZero_(row.intermediateCorrect),
      intermediateAccuracy: this.numberOrZero_(row.intermediateAccuracy),
      advancedAttempts: this.numberOrZero_(row.advancedAttempts),
      advancedCorrect: this.numberOrZero_(row.advancedCorrect),
      advancedAccuracy: this.numberOrZero_(row.advancedAccuracy),
      recent10BeginnerAttempts: this.numberOrZero_(row.recent10BeginnerAttempts),
      recent10IntermediateAttempts: this.numberOrZero_(row.recent10IntermediateAttempts),
      recent10AdvancedAttempts: this.numberOrZero_(row.recent10AdvancedAttempts),
      lastAnsweredAt: String(row.lastAnsweredAt || ''),
      lastLevel: String(row.lastLevel || ''),
      lastProblemType: String(row.lastProblemType || ''),
      averageElapsedMs: this.numberOrZero_(row.averageElapsedMs),
      medianElapsedMs: this.numberOrZero_(row.medianElapsedMs),
      recent10AverageElapsedMs: this.numberOrZero_(row.recent10AverageElapsedMs),
      recent10MedianElapsedMs: this.numberOrZero_(row.recent10MedianElapsedMs),
      correctAverageElapsedMs: this.numberOrZero_(row.correctAverageElapsedMs),
      correctRecent10AverageElapsedMs: this.numberOrZero_(row.correctRecent10AverageElapsedMs),
      first10AverageElapsedMs: this.numberOrZero_(row.first10AverageElapsedMs),
      speedImprovementRate: this.numberOrZero_(row.speedImprovementRate),
      lastElapsedMs: this.numberOrZero_(row.lastElapsedMs)
    };
  }

  static numberOrZero_(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  static getStudentAnswerSummary_(tokenRow) {
    const logs = SheetRepository.readAnswerLogsForRosterKey(tokenRow.rosterKey);
    const summary = this.summarizeAnswerLogsForStudent(tokenRow.rosterKey, logs);
    return {
      updatedAt: new Date().toISOString(),
      courseId: tokenRow.courseId,
      courseName: tokenRow.courseName,
      rosterKey: tokenRow.rosterKey,
      studentId: tokenRow.studentId,
      number: tokenRow.number,
      name: tokenRow.name,
      ...summary
    };
  }

  static toPublicStudent_(tokenRow) {
    return {
      courseId: tokenRow.courseId,
      courseName: tokenRow.courseName,
      rosterKey: tokenRow.rosterKey,
      studentId: tokenRow.studentId,
      number: tokenRow.number,
      name: tokenRow.name
    };
  }

  static toEntryFromExistingLog_(row) {
    return {
      timestamp: row.timestamp,
      attemptId: row.attemptId,
      token: row.token,
      courseId: row.courseId,
      courseName: row.courseName,
      rosterKey: row.rosterKey,
      studentId: row.studentId,
      number: row.number,
      name: row.name,
      level: row.level,
      problemType: row.problemType,
      questionText: row.questionText,
      expectedAnswer: row.expectedAnswer,
      submittedAnswer: row.submittedAnswer,
      normalizedSubmittedAnswer: row.normalizedSubmittedAnswer,
      unit: row.unit,
      isCorrect: row.isCorrect === true,
      tolerance: row.tolerance,
      significantDigits: row.significantDigits,
      avogadroConstant: row.avogadroConstant,
      requiresRounding: row.requiresRounding === true,
      explanation: row.explanation,
      elapsedMs: row.elapsedMs,
      clientInfo: row.clientInfo,
      ...this.extractAnswerAcceptanceFromClientInfo_(row.clientInfo)
    };
  }

  static buildAnswerClientInfo_(clientInfo, grade, autoPractice) {
    const base = this.parseClientInfo_(clientInfo);
    delete base.autoPractice;
    delete base.acceptedAnswerType;
    delete base.acceptedAnswer;
    delete base.exactAnswer;
    if(autoPractice && autoPractice.version===1) base.autoPractice={...autoPractice};
    const acceptedAnswerType = String(grade && grade.acceptedAnswerType || '');
    const exactAnswer = grade && grade.exactAnswer;
    if (acceptedAnswerType !== '') {
      base.acceptedAnswerType = acceptedAnswerType;
    }
    if (grade && grade.acceptedAnswer !== '') {
      base.acceptedAnswer = grade.acceptedAnswer;
    }
    if (Number.isFinite(Number(exactAnswer))) {
      base.exactAnswer = Number(exactAnswer);
    }
    return base;
  }

  static extractAnswerAcceptanceFromClientInfo_(clientInfo) {
    const parsed = this.parseClientInfo_(clientInfo);
    return {
      acceptedAnswerType: String(parsed.acceptedAnswerType || ''),
      acceptedAnswer: Number.isFinite(Number(parsed.acceptedAnswer)) ? Number(parsed.acceptedAnswer) : '',
      exactAnswer: Number.isFinite(Number(parsed.exactAnswer)) ? Number(parsed.exactAnswer) : ''
    };
  }

  static parseClientInfo_(clientInfo) {
    if (clientInfo && typeof clientInfo === 'object') {
      return { ...clientInfo };
    }
    const text = String(clientInfo == null ? '' : clientInfo).trim();
    if (text === '') {
      return {};
    }
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_ignored) {
      return {};
    }
  }

  static formatAnswerText_(value, unit, significantDigits, level) {
    const numeric = Number(value);
    let formatted = String(value == null ? '' : value);
    if (Number.isFinite(numeric)) {
      formatted = MolProblemService.needsSignificantDigits_(MolProblemService.normalizeLevel_(level))
        ? MolProblemService.formatNumberForDisplay_(numeric, Number(significantDigits || 3))
        : MolProblemService.formatPlain_(numeric);
    }
    const normalizedUnit = String(unit || '').trim();
    return normalizedUnit === '' ? formatted : `${formatted} ${normalizedUnit}`;
  }

  static roundRate_(correct, attempts) {
    if (!attempts) {
      return 0;
    }
    return Math.round((correct / attempts) * 10000) / 10000;
  }

  static roundDecimal_(value, digits) {
    const factor = 10 ** Number(digits || 0);
    return Math.round(Number(value || 0) * factor) / factor;
  }

  static requireActiveToken_(token, timings) {
    try {
      return TokenService.validateToken(token, timings || {});
    } catch (error) {
      throw new Error(`無効なURLです。先生に新しいURLを確認してください。${error && error.message ? error.message : String(error)}`);
    }
  }
}

class AggregationService {
  static buildAggregateRows(logs, updatedAt) {
    const grouped = new Map();
    for (const log of logs || []) {
      const rosterKey = String(log.rosterKey || '').trim();
      if (rosterKey === '' || TokenService.isTeacherTestStudentRosterKey(rosterKey)) {
        continue;
      }
      if (!grouped.has(rosterKey)) {
        grouped.set(rosterKey, []);
      }
      grouped.get(rosterKey).push(log);
    }
    return Array.from(grouped.entries())
      .map(([rosterKey, rows]) => {
        const sorted = rows.slice().sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        const latest = sorted[sorted.length - 1] || {};
        const summary = AnswerService.summarizeAnswerLogsForStudent(rosterKey, sorted);
        return {
          updatedAt,
          courseId: String(latest.courseId || ''),
          courseName: String(latest.courseName || ''),
          rosterKey,
          studentId: String(latest.studentId || ''),
          number: String(latest.number || ''),
          name: String(latest.name || ''),
          ...summary,
          lastAnsweredAt: String(latest.timestamp || ''),
          lastLevel: String(latest.level || ''),
          lastProblemType: String(latest.problemType || '')
        };
      })
      .sort((a, b) => `${a.courseName} ${a.number} ${a.name}`.localeCompare(`${b.courseName} ${b.number} ${b.name}`, 'ja'));
  }

  static buildProblemTypeStatsRows(logs, updatedAt) {
    const grouped = new Map();
    for (const log of logs || []) {
      const rosterKey = String(log.rosterKey || '').trim();
      const level = String(log.level || '').trim();
      const problemType = String(log.problemType || '').trim();
      if (rosterKey === '' || TokenService.isTeacherTestStudentRosterKey(rosterKey) || level === '' || problemType === '') {
        continue;
      }
      const key = `${rosterKey}\u0001${level}\u0001${problemType}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(log);
    }
    return Array.from(grouped.values())
      .map((rows) => {
        const sorted = rows.slice().sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
        const latest = sorted[sorted.length - 1] || {};
        const summary = AnswerService.summarizeProblemTypeStatsRows_(sorted);
        return {
          updatedAt,
          courseId: String(latest.courseId || ''),
          courseName: String(latest.courseName || ''),
          rosterKey: String(latest.rosterKey || ''),
          studentId: String(latest.studentId || ''),
          number: String(latest.number || ''),
          name: String(latest.name || ''),
          level: String(latest.level || ''),
          problemType: String(latest.problemType || ''),
          ...summary
        };
      })
      .sort((a, b) => `${a.courseName} ${a.number} ${a.name} ${a.level} ${a.problemType}`.localeCompare(`${b.courseName} ${b.number} ${b.name} ${b.level} ${b.problemType}`, 'ja'));
  }

  static buildAdminProgressRows(students, summaries, tokens, distributionLogs) {
    const summaryByRosterKey = new Map((summaries || []).map((summary) => [String(summary.rosterKey || '').trim(), summary]));
    const tokenByRosterKey = new Map((tokens || [])
      .filter((token) => String(token.rosterKey || '').trim() !== '')
      .map((token) => [String(token.rosterKey || '').trim(), token]));
    const distributedRosterKeys = this.buildDistributionStatusSet_(distributionLogs, 'SUCCESS');
    const failedRosterKeys = this.buildDistributionStatusSet_(distributionLogs, 'ERROR');
    return (students || [])
      .filter((student) => String(student.status || '在籍') !== '退籍')
      .map((student) => {
        const rosterKey = String(student.rosterKey || TokenService.createRosterKey(student.courseId, student.studentId)).trim();
        const summary = summaryByRosterKey.get(rosterKey) || {};
        const token = tokenByRosterKey.get(rosterKey) || {};
        const hasActiveToken = String(token.token || '').trim() !== '' && !SheetRepository.isFlagEnabled_(token.revoked);
        const totalAttempts = Number(summary.totalAttempts || 0);
        const hasAccessEvidence = String(token.lastAccessedAt || '').trim() !== '' || totalAttempts > 0;
        const distributionStatus = !hasActiveToken
          ? '未配付'
          : distributedRosterKeys.has(rosterKey) || hasAccessEvidence
            ? '配付済み'
            : failedRosterKeys.has(rosterKey)
              ? '配付失敗'
              : '未配付';
        const recent10Accuracy = Number(summary.recent10Accuracy || 0);
        const totalAccuracy = Number(summary.totalAccuracy || 0);
        const recent10Attempts = Number(summary.recent10Attempts || 0);
        const speedImprovementRate = Number(summary.speedImprovementRate || 0);
        const advancedAttempts = Number(summary.advancedAttempts || 0);
        const accessStatus = hasAccessEvidence ? 'アクセス済み' : '未アクセス';
        const statusLabel = this.classifyAdminProgressStatus_({
          distributionStatus,
          accessStatus,
          totalAttempts,
          recent10Attempts,
          recent10Accuracy,
          totalAccuracy,
          speedImprovementRate,
          advancedAttempts, lv5Attempts: summary.lv5Attempts, lv6Attempts: summary.lv6Attempts
        });
        const followUp = this.isFollowUpStatus_(statusLabel);
        return {
          courseId: String(student.courseId || summary.courseId || ''),
          courseName: String(student.courseName || summary.courseName || ''),
          rosterKey,
          studentId: String(student.studentId || summary.studentId || ''),
          number: String(student.number || summary.number || ''),
          name: String(student.name || summary.name || ''),
          distributionStatus,
          accessStatus,
          totalAttempts,
          totalCorrect: Number(summary.totalCorrect || 0),
          totalAccuracy,
          recent10Attempts,
          recent10Correct: Number(summary.recent10Correct || 0),
          recent10Accuracy,
          ...MolProblemService.practiceLevelMetrics_(summary),
          beginnerAttempts: Number(summary.beginnerAttempts || 0),
          beginnerCorrect: Number(summary.beginnerCorrect || 0),
          beginnerAccuracy: Number(summary.beginnerAccuracy || 0),
          intermediateAttempts: Number(summary.intermediateAttempts || 0),
          intermediateCorrect: Number(summary.intermediateCorrect || 0),
          intermediateAccuracy: Number(summary.intermediateAccuracy || 0),
          advancedAttempts,
          advancedCorrect: Number(summary.advancedCorrect || 0),
          advancedAccuracy: Number(summary.advancedAccuracy || 0),
          recent10BeginnerAttempts: Number(summary.recent10BeginnerAttempts || 0),
          recent10IntermediateAttempts: Number(summary.recent10IntermediateAttempts || 0),
          recent10AdvancedAttempts: Number(summary.recent10AdvancedAttempts || 0),
          lastAnsweredAt: String(summary.lastAnsweredAt || ''),
          lastLevel: String(summary.lastLevel || ''),
          lastProblemType: String(summary.lastProblemType || ''),
          averageElapsedMs: Number(summary.averageElapsedMs || 0),
          medianElapsedMs: Number(summary.medianElapsedMs || 0),
          recent10AverageElapsedMs: Number(summary.recent10AverageElapsedMs || 0),
          recent10MedianElapsedMs: Number(summary.recent10MedianElapsedMs || 0),
          correctAverageElapsedMs: Number(summary.correctAverageElapsedMs || 0),
          correctRecent10AverageElapsedMs: Number(summary.correctRecent10AverageElapsedMs || 0),
          first10AverageElapsedMs: Number(summary.first10AverageElapsedMs || 0),
          speedImprovementRate,
          lastElapsedMs: Number(summary.lastElapsedMs || 0),
          speedTrendLabel: speedImprovementRate > 0 && recent10Attempts >= 10 && recent10Accuracy >= 0.7
            ? '正答率維持で改善'
            : '',
          followUp,
          statusLabel
        };
      })
      .sort((a, b) => `${a.courseName} ${a.number} ${a.name}`.localeCompare(`${b.courseName} ${b.number} ${b.name}`, 'ja'));
  }

  static buildAdminDashboardMetrics(progressRows) {
    const rows = progressRows || [];
    const totalAnswers = rows.reduce((sum, row) => sum + Number(row.totalAttempts || 0), 0);
    const totalCorrect = rows.reduce((sum, row) => sum + Number(row.totalCorrect || 0), 0);
    const recent10Attempts = rows.reduce((sum, row) => sum + Number(row.recent10Attempts || 0), 0);
    const recent10Correct = rows.reduce((sum, row) => sum + Number(row.recent10Correct || 0), 0);
    return {
      distributedCount: rows.filter((row) => row.distributionStatus === '配付済み').length,
      accessedCount: rows.filter((row) => row.accessStatus === 'アクセス済み').length,
      answeredCount: rows.filter((row) => Number(row.totalAttempts || 0) > 0).length,
      notStartedCount: rows.filter((row) => Number(row.totalAttempts || 0) === 0).length,
      totalAnswers,
      averageAccuracy: this.roundRate_(totalCorrect, totalAnswers),
      recent10AverageAccuracy: this.roundRate_(recent10Correct, recent10Attempts),
      beginnerAnswers: rows.reduce((sum, row) => sum + Number(row.beginnerAttempts || 0), 0),
      intermediateAnswers: rows.reduce((sum, row) => sum + Number(row.intermediateAttempts || 0), 0),
      advancedAnswers: rows.reduce((sum, row) => sum + Number(row.advancedAttempts || 0), 0),
      speedImprovedStudentCount: rows.filter((row) => Number(row.speedImprovementRate || 0) > 0).length,
      followUpStudentCount: rows.filter((row) => row.followUp === true).length
    };
  }

  static classifyAdminProgressStatus_(row) {
    if (row.distributionStatus !== '配付済み') {
      return row.distributionStatus === '配付失敗' ? '要フォロー' : '未配付';
    }
    if (row.accessStatus !== 'アクセス済み') {
      return '未アクセス';
    }
    if (row.totalAttempts === 0) {
      return '未実施';
    }
    if ((row.recent10Attempts >= 5 && row.recent10Accuracy < 0.5) || (row.totalAttempts >= 5 && row.totalAccuracy < 0.5)) {
      return '要フォロー';
    }
    if (row.recent10Attempts >= 10 && row.speedImprovementRate >= 0.2 && row.recent10Accuracy < row.totalAccuracy && row.recent10Accuracy < 0.7) {
      return '速度上昇・正答率低下';
    }
    if ((Number(row.advancedAttempts || 0) + Number(row.lv5Attempts || 0) + Number(row.lv6Attempts || 0)) > 0 && row.recent10Attempts >= 10 && row.recent10Accuracy >= 0.7) {
      return '上級挑戦中';
    }
    if (row.recent10Attempts < 10) {
      return '解答中';
    }
    return '順調';
  }

  static isFollowUpStatus_(statusLabel) {
    return ['未配付', '未アクセス', '未実施', '要フォロー', '速度上昇・正答率低下'].includes(String(statusLabel || ''));
  }

  static buildDistributionStatusSet_(logs, targetStatus) {
    const result = new Set();
    const sent = new Set();
    for (const log of logs || []) {
      const rosterKey = String(log.rosterKey || '').trim();
      if (rosterKey === '') {
        continue;
      }
      const normalizedStatus = typeof DistributionService !== 'undefined'
        ? DistributionService.normalizeDistributionStatus_(log.status)
        : String(log.status || '').trim().toUpperCase();
      if (normalizedStatus === 'SUCCESS') {
        sent.add(rosterKey);
      }
      if (normalizedStatus === targetStatus) {
        result.add(rosterKey);
      }
    }
    if (targetStatus === 'ERROR') {
      for (const rosterKey of sent) {
        result.delete(rosterKey);
      }
    }
    return result;
  }

  static rebuildAggregateCache() {
    const logs = SheetRepository.readAnswerLogs();
    const updatedAt = new Date().toISOString();
    const rows = this.buildAggregateRows(logs, updatedAt);
    const problemTypeRows = this.buildProblemTypeStatsRows(logs, updatedAt);
    SheetRepository.writeAggregateCache(rows);
    SheetRepository.writeProblemTypeStatsRows(problemTypeRows);
    return {
      updated: rows.length,
      problemTypeUpdated: problemTypeRows.length,
      problemTypeRows,
      rows
    };
  }

  static rebuildProblemTypeStatsCache() {
    const rows = this.buildProblemTypeStatsRows(SheetRepository.readAnswerLogs(), new Date().toISOString());
    SheetRepository.writeProblemTypeStatsRows(rows);
    return {
      updated: rows.length,
      rows
    };
  }

  static roundRate_(correct, attempts) {
    if (!attempts) {
      return 0;
    }
    return Math.round((correct / attempts) * 10000) / 10000;
  }
}

class DistributionService {
  static createRunId() {
    return `RUN_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  static buildDistributionTargets(tokenRows, logRows, options) {
    const normalizedOptions = options || {};
    const courseFilter = this.normalizeStringSetOption_(normalizedOptions, 'courseId', 'courseIds');
    const rosterFilter = this.normalizeStringSetOption_(normalizedOptions, 'rosterKey', 'rosterKeys');
    const tokenFilter = this.normalizeStringSetOption_(normalizedOptions, 'token', 'tokens');
    this.validateDistributionOptionCombination_(normalizedOptions, [courseFilter, rosterFilter, tokenFilter].some((filter) => filter.values.size > 0));
    if ([courseFilter, rosterFilter, tokenFilter].some((filter) => filter.explicit && filter.values.size === 0)) {
      return [];
    }
    const batchSize = this.normalizeBatchSize_(normalizedOptions.batchSize, MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE);
    const forceRedistribute = normalizedOptions.forceRedistribute === true;
    const sentKeys = new Set();
    const failedKeys = new Set();
    for (const log of logRows || []) {
      const key = this.getDistributionIdentityKey_(log);
      if (key === '') {
        continue;
      }
      const status = this.normalizeDistributionStatus_(log.status);
      if (status === 'SUCCESS') {
        sentKeys.add(key);
        failedKeys.delete(key);
      } else if (status === 'ERROR' && !sentKeys.has(key)) {
        failedKeys.add(key);
      }
    }
    const targets = [];
    for (const row of tokenRows || []) {
      const rowToken = String(row && row.token || '').trim();
      const key = this.getDistributionIdentityKey_(row);
      if (rowToken === '' || key === '' || SheetRepository.isFlagEnabled_(row.revoked)) {
        continue;
      }
      if (TokenService.isTeacherTestStudentRosterKey(row.rosterKey)) {
        continue;
      }
      if (courseFilter.values.size > 0 && !courseFilter.values.has(String(row.courseId || '').trim())) {
        continue;
      }
      if (rosterFilter.values.size > 0 && !rosterFilter.values.has(String(row.rosterKey || '').trim())) {
        continue;
      }
      if (tokenFilter.values.size > 0 && !tokenFilter.values.has(rowToken)) {
        continue;
      }
      if (!forceRedistribute && sentKeys.has(key)) {
        continue;
      }
      if (normalizedOptions.retryFailedOnly === true && !failedKeys.has(key)) {
        continue;
      }
      targets.push(row);
    }
    return targets.slice(0, batchSize);
  }

  static getDistributionTargetsPreview(options) {
    SheetRepository.assertManagementSheetsReady();
    const normalizedOptions = options || {};
    const tokenRows = SheetRepository.readTokenRows();
    const logRows = SheetRepository.readDistributionLogs();
    const settings = this.getClassroomSendSettings_(normalizedOptions);
    const scope = this.resolveDistributionScope_(normalizedOptions);
    this.validateDistributionOptionCombination_(normalizedOptions, scope.hasNonEmptyExplicitFilter);
    if (scope.useCourseFilter && scope.courseIds.length === 0) {
      return {
        courseIds: [],
        rosterKeys: scope.rosterKeys,
        tokens: scope.tokens,
        forceRedistribute: normalizedOptions.forceRedistribute === true,
        retryFailedOnly: normalizedOptions.retryFailedOnly === true,
        batchSize: settings.batchSize,
        dryRun: settings.dryRun,
        targetCount: 0,
        failedTargetCount: 0,
        targets: [],
        failedTargets: []
      };
    }
    const scopedOptions = {
      ...normalizedOptions,
      ...(scope.useCourseFilter ? { courseIds: scope.courseIds } : {}),
      batchSize: settings.batchSize
    };
    const targets = this.buildDistributionTargets(tokenRows, logRows, {
      ...scopedOptions
    });
    const failedTargets = this.buildDistributionTargets(tokenRows, logRows, {
      ...scopedOptions,
      forceRedistribute: false,
      retryFailedOnly: true,
    });
    return {
      courseIds: scope.courseIds,
      rosterKeys: scope.rosterKeys,
      tokens: scope.tokens,
      forceRedistribute: normalizedOptions.forceRedistribute === true,
      retryFailedOnly: normalizedOptions.retryFailedOnly === true,
      batchSize: settings.batchSize,
      dryRun: settings.dryRun,
      targetCount: targets.length,
      failedTargetCount: failedTargets.length,
      targets,
      failedTargets
    };
  }

  static distributeStudentUrlsForCheckedCourses(options) {
    SheetRepository.assertManagementSheetsReady();
    const normalizedOptions = options || {};
    const startedAt = new Date().toISOString();
    const runId = this.createRunId();
    const settings = this.getClassroomSendSettings_(normalizedOptions);
    const scope = this.resolveDistributionScope_(normalizedOptions);
    this.validateDistributionOptionCombination_(normalizedOptions, scope.hasNonEmptyExplicitFilter);
    if (!scope.hasExplicitFilter && scope.useCourseFilter && scope.courseIds.length === 0) {
      throw new Error('配付対象Classroomが選択されていません。Classroom一覧の同期対象をチェックしてください。');
    }
    const tokenRows = SheetRepository.readTokenRows();
    const logRows = SheetRepository.readDistributionLogs();
    const targets = this.buildDistributionTargets(tokenRows, logRows, {
      ...normalizedOptions,
      ...(scope.useCourseFilter ? { courseIds: scope.courseIds } : {}),
      batchSize: settings.batchSize
    });
    const logs = [];
    let successCount = 0;
    let errorCount = 0;
    let dryRunCount = 0;
    for (const row of targets) {
      try {
        const text = this.renderTemplate_(settings.template, row);
        let post = null;
        if (!settings.dryRun) {
          post = ClassroomService.createStudentUrlAnnouncement(row.courseId, row.studentId, text);
        }
        logs.push({
          timestamp: new Date().toISOString(),
          runId,
          courseId: row.courseId,
          rosterKey: row.rosterKey,
          studentId: row.studentId,
          token: row.token,
          studentUrl: row.studentUrl,
          classroomAnnouncementId: post && post.id ? post.id : '',
          status: settings.dryRun ? 'DRY_RUN' : 'SUCCESS',
          errorMessage: settings.dryRun ? 'DRY_RUN: Classroom投稿は作成していません。' : ''
        });
        if (settings.dryRun) {
          dryRunCount += 1;
        } else {
          successCount += 1;
        }
      } catch (error) {
        LoggerService.logDeveloperError(`Failed to distribute Classroom URL: ${row.rosterKey || row.token}`, error);
        logs.push({
          timestamp: new Date().toISOString(),
          runId,
          courseId: row.courseId,
          rosterKey: row.rosterKey,
          studentId: row.studentId,
          token: row.token,
          studentUrl: row.studentUrl,
          classroomAnnouncementId: '',
          status: 'ERROR',
          errorMessage: error && error.message ? error.message : String(error)
        });
        errorCount += 1;
      }
    }
    if (settings.enableDistributionLog || settings.dryRun) {
      SheetRepository.appendDistributionLogs(logs);
    }
    const finishedAt = new Date().toISOString();
    SheetRepository.appendRunLog({
      runId,
      operation: settings.dryRun ? 'CLASSROOM_URL_DISTRIBUTION_DRY_RUN' : 'CLASSROOM_URL_DISTRIBUTION',
      startedAt,
      finishedAt,
      processedCount: targets.length,
      successCount: successCount + dryRunCount,
      errorCount,
      skippedCount: 0,
      nextAction: targets.length >= settings.batchSize ? 'CLASSROOM_DISTRIBUTION_NEXT' : 'DONE'
    });
    return {
      runId,
      processed: targets.length,
      success: successCount,
      dryRun: dryRunCount,
      error: errorCount,
      skipped: 0,
      logs
    };
  }

  static retryFailedStudentUrlDistributions(options) {
    return this.distributeStudentUrlsForCheckedCourses({
      ...(options || {}),
      retryFailedOnly: true
    });
  }

  static deleteRequestedClassroomUrlPosts(options) {
    SheetRepository.assertManagementSheetsReady();
    const startedAt = new Date().toISOString();
    const runId = this.createRunId();
    const tokenRows = SheetRepository.readTokenRows();
    const logRows = SheetRepository.readDistributionLogs();
    const targets = this.buildRequestedClassroomUrlDeletionTargets(tokenRows, logRows);
    const targetsByTokenIndex = new Map();
    for (const target of targets) {
      const list = targetsByTokenIndex.get(target.tokenRowIndex) || [];
      list.push(target);
      targetsByTokenIndex.set(target.tokenRowIndex, list);
    }
    const requestedIndexes = [];
    const nextTokenRows = tokenRows.map((row, index) => {
      if (!SheetRepository.isRequestFlag_(row && row.postDeletionRequested)) {
        return { ...row };
      }
      requestedIndexes.push(index);
      return {
        ...row,
        revoked: true
      };
    });
    const outcomes = new Map(requestedIndexes.map((index) => [index, {
      targetCount: (targetsByTokenIndex.get(index) || []).length,
      hasError: false
    }]));
    const logs = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let noTargetCount = 0;
    for (const tokenRowIndex of requestedIndexes) {
      const rowTargets = targetsByTokenIndex.get(tokenRowIndex) || [];
      if (rowTargets.length === 0) {
        noTargetCount += 1;
        continue;
      }
      for (const target of rowTargets) {
        try {
          ClassroomService.deleteStudentUrlAnnouncement(target.courseId, target.classroomAnnouncementId);
          logs.push(this.createClassroomUrlDeletionLog_(runId, target, 'DELETED', `Classroom投稿を削除しました。投稿削除指定: ${target.rosterKey || target.token} / 元runId: ${target.sourceRunId}`));
          successCount += 1;
        } catch (error) {
          const message = AdminService.formatErrorMessage_(error);
          if (this.isAlreadyDeletedClassroomAnnouncementError_(error)) {
            logs.push(this.createClassroomUrlDeletionLog_(runId, target, 'DELETE_SKIPPED', `Classroom投稿はすでに削除済みです。投稿削除指定: ${target.rosterKey || target.token} / 元runId: ${target.sourceRunId}: ${message}`));
            skippedCount += 1;
          } else {
            const outcome = outcomes.get(tokenRowIndex);
            if (outcome) {
              outcome.hasError = true;
            }
            LoggerService.logDeveloperError(`Failed to delete requested Classroom URL announcement: ${target.courseId}/${target.classroomAnnouncementId}`, error);
            logs.push(this.createClassroomUrlDeletionLog_(runId, target, 'DELETE_ERROR', message));
            errorCount += 1;
          }
        }
      }
    }
    const finishedAt = new Date().toISOString();
    for (const tokenRowIndex of requestedIndexes) {
      const outcome = outcomes.get(tokenRowIndex) || { targetCount: 0, hasError: false };
      const row = nextTokenRows[tokenRowIndex];
      if (outcome.hasError) {
        nextTokenRows[tokenRowIndex] = {
          ...row,
          postDeletionRequested: false,
          postDeletionStatus: '失敗',
          note: TokenService.appendNote_(row.note, `投稿削除失敗 ${finishedAt}`)
        };
      } else if (outcome.targetCount > 0) {
        nextTokenRows[tokenRowIndex] = {
          ...row,
          postDeletionRequested: false,
          postDeletionStatus: '済',
          note: TokenService.appendNote_(row.note, `投稿削除済 ${finishedAt}`)
        };
      } else {
        nextTokenRows[tokenRowIndex] = {
          ...row,
          postDeletionRequested: false,
          postDeletionStatus: '対象なし',
          note: TokenService.appendNote_(row.note, `投稿削除対象なし ${finishedAt}`)
        };
      }
    }
    if (requestedIndexes.length > 0) {
      SheetRepository.writeTokenRows(nextTokenRows);
      TokenService.clearTokenRowCachesForRows_(requestedIndexes.flatMap((index) => [tokenRows[index], nextTokenRows[index]]));
    }
    SheetRepository.appendDistributionLogs(logs);
    SheetRepository.appendRunLog({
      runId,
      operation: 'REQUESTED_CLASSROOM_URL_POST_DELETE',
      startedAt,
      finishedAt,
      processedCount: requestedIndexes.length,
      successCount,
      errorCount,
      skippedCount: skippedCount + noTargetCount,
      nextAction: errorCount > 0 ? 'RETRY_REQUESTED_CLASSROOM_URL_POST_DELETE' : 'DONE'
    });
    return {
      runId,
      targetStudents: requestedIndexes.length,
      revokedCount: requestedIndexes.length,
      processed: targets.length,
      success: successCount,
      error: errorCount,
      skipped: skippedCount,
      noTarget: noTargetCount,
      logs,
      message: `投稿削除=1 のURL無効化とClassroom投稿削除を実行しました。対象 ${requestedIndexes.length}人 / 無効化 ${requestedIndexes.length}件 / 投稿削除成功 ${successCount}件 / 投稿削除失敗 ${errorCount}件 / スキップ ${skippedCount + noTargetCount}件`
    };
  }

  static buildRequestedClassroomUrlDeletionTargets(tokenRows, distributionLogs) {
    const deletedKeys = this.getDeletedClassroomAnnouncementKeys_(distributionLogs);
    const seenKeys = new Set();
    const targets = [];
    (tokenRows || []).forEach((tokenRow, tokenRowIndex) => {
      if (!SheetRepository.isRequestFlag_(tokenRow && tokenRow.postDeletionRequested)) {
        return;
      }
      for (const log of distributionLogs || []) {
        if (this.normalizeDistributionStatus_(log && log.status) !== 'SUCCESS') {
          continue;
        }
        const courseId = String(log && log.courseId || '').trim();
        const classroomAnnouncementId = String(log && log.classroomAnnouncementId || '').trim();
        if (courseId === '' || classroomAnnouncementId === '') {
          continue;
        }
        if (!this.doesDistributionLogMatchTokenRow_(log, tokenRow)) {
          continue;
        }
        const key = this.getClassroomAnnouncementKey_(courseId, classroomAnnouncementId);
        if (deletedKeys.has(key) || seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        targets.push({
          timestamp: String(log.timestamp || '').trim(),
          sourceRunId: String(log.runId || '').trim(),
          tokenRowIndex,
          courseId,
          rosterKey: String(log.rosterKey || tokenRow.rosterKey || '').trim(),
          studentId: String(log.studentId || tokenRow.studentId || '').trim(),
          token: String(log.token || tokenRow.token || '').trim(),
          studentUrl: String(log.studentUrl || tokenRow.studentUrl || '').trim(),
          classroomAnnouncementId
        });
      }
    });
    return targets;
  }

  static doesDistributionLogMatchTokenRow_(log, tokenRow) {
    const rowToken = String(tokenRow && tokenRow.token || '').trim();
    const logToken = String(log && log.token || '').trim();
    if (rowToken !== '' && logToken === rowToken) {
      return true;
    }
    const rowRosterKey = String(tokenRow && tokenRow.rosterKey || '').trim();
    const logRosterKey = String(log && log.rosterKey || '').trim();
    if (rowRosterKey !== '' && logRosterKey === rowRosterKey) {
      return true;
    }
    const rowCourseId = String(tokenRow && tokenRow.courseId || '').trim();
    const rowStudentId = String(tokenRow && tokenRow.studentId || '').trim();
    const logCourseId = String(log && log.courseId || '').trim();
    const logStudentId = String(log && log.studentId || '').trim();
    return rowCourseId !== '' && rowStudentId !== '' && logCourseId === rowCourseId && logStudentId === rowStudentId;
  }

  static deleteLatestClassroomUrlDistribution(options) {
    SheetRepository.assertManagementSheetsReady();
    const logRows = SheetRepository.readDistributionLogs();
    const latestRunId = this.findLatestClassroomUrlDistributionRunId_(logRows);
    if (latestRunId === '') {
      return this.executeClassroomUrlDistributionDeletion_('', [], 'CLASSROOM_URL_DISTRIBUTION_DELETE_LATEST');
    }
    return this.deleteClassroomUrlDistributionByRunId(latestRunId, {
      ...(options || {}),
      operationName: 'CLASSROOM_URL_DISTRIBUTION_DELETE_LATEST'
    });
  }

  static deleteClassroomUrlDistributionByRunId(runId, options) {
    SheetRepository.assertManagementSheetsReady();
    const sourceRunId = String(runId || '').trim();
    if (sourceRunId === '') {
      throw new Error('削除対象の配付runIdが空です。');
    }
    const logRows = SheetRepository.readDistributionLogs();
    const targets = this.buildClassroomUrlDeletionTargets(logRows, sourceRunId);
    const operationName = String(options && options.operationName || 'CLASSROOM_URL_DISTRIBUTION_DELETE_BY_RUN_ID');
    return this.executeClassroomUrlDistributionDeletion_(sourceRunId, targets, operationName);
  }

  static buildClassroomUrlDeletionTargets(logRows, sourceRunId) {
    const normalizedRunId = String(sourceRunId || '').trim();
    const deletedKeys = this.getDeletedClassroomAnnouncementKeys_(logRows);
    const seenKeys = new Set();
    const targets = [];
    for (const log of logRows || []) {
      if (String(log && log.runId || '').trim() !== normalizedRunId) {
        continue;
      }
      if (this.normalizeDistributionStatus_(log && log.status) !== 'SUCCESS') {
        continue;
      }
      const courseId = String(log && log.courseId || '').trim();
      const classroomAnnouncementId = String(log && log.classroomAnnouncementId || '').trim();
      if (courseId === '' || classroomAnnouncementId === '') {
        continue;
      }
      const key = this.getClassroomAnnouncementKey_(courseId, classroomAnnouncementId);
      if (deletedKeys.has(key) || seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      targets.push({
        timestamp: String(log.timestamp || '').trim(),
        sourceRunId: normalizedRunId,
        courseId,
        rosterKey: String(log.rosterKey || '').trim(),
        studentId: String(log.studentId || '').trim(),
        token: String(log.token || '').trim(),
        studentUrl: String(log.studentUrl || '').trim(),
        classroomAnnouncementId
      });
    }
    return targets;
  }

  static findLatestClassroomUrlDistributionRunId_(logRows) {
    for (let index = (logRows || []).length - 1; index >= 0; index -= 1) {
      const log = logRows[index] || {};
      if (this.normalizeDistributionStatus_(log.status) !== 'SUCCESS') {
        continue;
      }
      const runId = String(log.runId || '').trim();
      const courseId = String(log.courseId || '').trim();
      const classroomAnnouncementId = String(log.classroomAnnouncementId || '').trim();
      if (runId !== '' && courseId !== '' && classroomAnnouncementId !== '') {
        return runId;
      }
    }
    return '';
  }

  static getDeletedClassroomAnnouncementKeys_(logRows) {
    const deletedKeys = new Set();
    for (const log of logRows || []) {
      const status = this.normalizeDistributionStatus_(log && log.status);
      if (status !== 'DELETED' && status !== 'DELETE_SKIPPED') {
        continue;
      }
      const courseId = String(log && log.courseId || '').trim();
      const classroomAnnouncementId = String(log && log.classroomAnnouncementId || '').trim();
      if (courseId !== '' && classroomAnnouncementId !== '') {
        deletedKeys.add(this.getClassroomAnnouncementKey_(courseId, classroomAnnouncementId));
      }
    }
    return deletedKeys;
  }

  static getClassroomAnnouncementKey_(courseId, announcementId) {
    return `${String(courseId || '').trim()}::${String(announcementId || '').trim()}`;
  }

  static executeClassroomUrlDistributionDeletion_(sourceRunId, targets, operationName) {
    const startedAt = new Date().toISOString();
    const runId = this.createRunId();
    const logs = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    for (const target of targets || []) {
      try {
        ClassroomService.deleteStudentUrlAnnouncement(target.courseId, target.classroomAnnouncementId);
        logs.push(this.createClassroomUrlDeletionLog_(runId, target, 'DELETED', `Classroom投稿を削除しました。元runId: ${target.sourceRunId}`));
        successCount += 1;
      } catch (error) {
        const message = AdminService.formatErrorMessage_(error);
        if (this.isAlreadyDeletedClassroomAnnouncementError_(error)) {
          // Classroom returns FAILED_PRECONDITION when the announcement is already deleted.
          // Keep it distinct from DELETED so operators can see that the local log did not contain the original deletion record.
          logs.push(this.createClassroomUrlDeletionLog_(runId, target, 'DELETE_SKIPPED', `Classroom投稿はすでに削除済みです。元runId: ${target.sourceRunId}: ${message}`));
          skippedCount += 1;
        } else {
          LoggerService.logDeveloperError(`Failed to delete Classroom URL announcement: ${target.courseId}/${target.classroomAnnouncementId}`, error);
          logs.push(this.createClassroomUrlDeletionLog_(runId, target, 'DELETE_ERROR', message));
          errorCount += 1;
        }
      }
    }
    SheetRepository.appendDistributionLogs(logs);
    const finishedAt = new Date().toISOString();
    SheetRepository.appendRunLog({
      runId,
      operation: operationName,
      startedAt,
      finishedAt,
      processedCount: (targets || []).length,
      successCount,
      errorCount,
      skippedCount,
      nextAction: errorCount > 0 ? 'RETRY_CLASSROOM_URL_DISTRIBUTION_DELETE' : 'DONE'
    });
    const hasTargets = (targets || []).length > 0;
    const message = hasTargets
      ? `Classroom URL配付投稿の削除を実行しました。元runId: ${sourceRunId} / 処理 ${targets.length}件 / 成功 ${successCount}件 / 失敗 ${errorCount}件 / スキップ ${skippedCount}件`
      : (sourceRunId
        ? `元runId ${sourceRunId} に削除対象のClassroom URL配付投稿はありません。`
        : '削除対象のClassroom URL配付投稿はありません。');
    return {
      runId,
      sourceRunId: String(sourceRunId || '').trim(),
      processed: (targets || []).length,
      success: successCount,
      error: errorCount,
      skipped: skippedCount,
      logs,
      message
    };
  }

  static createClassroomUrlDeletionLog_(runId, target, status, errorMessage) {
    return {
      timestamp: new Date().toISOString(),
      runId,
      courseId: target.courseId,
      rosterKey: target.rosterKey,
      studentId: target.studentId,
      token: target.token,
      studentUrl: target.studentUrl,
      classroomAnnouncementId: target.classroomAnnouncementId,
      status,
      errorMessage
    };
  }

  static isAlreadyDeletedClassroomAnnouncementError_(error) {
    const message = AdminService.formatErrorMessage_(error);
    return /FAILED_PRECONDITION|already\s+deleted|すでに削除|削除済み/i.test(message);
  }

  static renderTemplate_(template, row) {
    const values = {
      courseId: row.courseId,
      Classroom名: row.courseName,
      courseName: row.courseName,
      rosterKey: row.rosterKey,
      studentId: row.studentId,
      出席番号: row.number,
      氏名: row.name,
      メール: row.email,
      token: row.token,
      studentUrl: row.studentUrl
    };
    return String(template || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => String(values[key] == null ? '' : values[key]));
  }

  static validatePostTextTemplate_(template) {
    if (!/\{\{\s*studentUrl\s*\}\}/.test(String(template || ''))) {
      throw new Error('設定シートの POST_TEXT_TEMPLATE に {{studentUrl}} を含めてください。');
    }
  }

  static getClassroomSendSettings_(options) {
    const batchSize = this.normalizeBatchSize_(
      options.batchSize,
      Number(SheetRepository.getSettingValue('CLASSROOM_SEND_BATCH_SIZE') || SheetRepository.getSettingValue('CLASSROOM_DISTRIBUTION_BATCH_SIZE') || MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE)
    );
    const dryRun = typeof options.dryRun === 'boolean' ? options.dryRun : this.toBoolean_(SheetRepository.getSettingValue('DRY_RUN'), false);
    const enableDistributionLog = typeof options.enableDistributionLog === 'boolean' ? options.enableDistributionLog : this.toBoolean_(SheetRepository.getSettingValue('ENABLE_DISTRIBUTION_LOG'), true);
    const template = String(options.postTextTemplate || SheetRepository.getSettingValue('POST_TEXT_TEMPLATE') || SheetRepository.getSettingValue('classroomPostTextTemplate') || MOL_DRILL_DEFAULT_POST_TEXT_TEMPLATE);
    this.validatePostTextTemplate_(template);
    return {
      batchSize,
      dryRun,
      enableDistributionLog,
      template
    };
  }

  static resolveDistributionScope_(options) {
    const normalizedOptions = options || {};
    const courseFilter = this.normalizeStringSetOption_(normalizedOptions, 'courseId', 'courseIds');
    const rosterFilter = this.normalizeStringSetOption_(normalizedOptions, 'rosterKey', 'rosterKeys');
    const tokenFilter = this.normalizeStringSetOption_(normalizedOptions, 'token', 'tokens');
    const hasExplicitFilter = courseFilter.explicit || rosterFilter.explicit || tokenFilter.explicit;
    const hasNonEmptyExplicitFilter = courseFilter.values.size > 0 || rosterFilter.values.size > 0 || tokenFilter.values.size > 0;
    const shouldFallbackToCheckedCourses = !hasExplicitFilter;
    const useCourseFilter = courseFilter.explicit || shouldFallbackToCheckedCourses;
    const courseIds = courseFilter.explicit
      ? courseFilter.list
      : (shouldFallbackToCheckedCourses ? SheetRepository.getCheckedCourses().map((course) => String(course.courseId || '').trim()).filter((courseId) => courseId !== '') : []);
    return {
      courseIds,
      rosterKeys: rosterFilter.list,
      tokens: tokenFilter.list,
      hasExplicitFilter,
      hasNonEmptyExplicitFilter,
      useCourseFilter
    };
  }

  static resolveTargetCourseIds_(options) {
    if (options.courseId) {
      return [String(options.courseId).trim()].filter((courseId) => courseId !== '');
    }
    if (Array.isArray(options.courseIds) && options.courseIds.length > 0) {
      return options.courseIds.map((courseId) => String(courseId || '').trim()).filter((courseId) => courseId !== '');
    }
    return SheetRepository.getCheckedCourses().map((course) => course.courseId);
  }

  static normalizeCourseIdSet_(options) {
    return this.normalizeStringSetOption_(options || {}, 'courseId', 'courseIds').values;
  }

  static normalizeStringSetOption_(options, singleKey, multiKey) {
    const source = options || {};
    const values = [];
    let explicit = false;
    if (Object.prototype.hasOwnProperty.call(source, singleKey)) {
      explicit = true;
      values.push(source[singleKey]);
    }
    if (Object.prototype.hasOwnProperty.call(source, multiKey)) {
      explicit = true;
      if (Array.isArray(source[multiKey])) {
        values.push(...source[multiKey]);
      } else if (source[multiKey] != null) {
        values.push(source[multiKey]);
      }
    }
    const list = [];
    const seen = new Set();
    for (const value of values) {
      const normalized = String(value == null ? '' : value).trim();
      if (normalized === '' || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      list.push(normalized);
    }
    return {
      explicit,
      list,
      values: new Set(list)
    };
  }

  static validateDistributionOptionCombination_(options, hasNonEmptyExplicitFilter) {
    const normalizedOptions = options || {};
    if (normalizedOptions.retryFailedOnly === true && normalizedOptions.forceRedistribute === true) {
      throw new Error('失敗分再送と強制再配付は同時に指定できません。');
    }
    if (normalizedOptions.forceRedistribute === true && hasNonEmptyExplicitFilter !== true) {
      throw new Error('強制再配付は対象Classroomまたは対象生徒を指定してください。');
    }
  }

  static getDistributionIdentityKey_(row) {
    const rosterKey = String(row && row.rosterKey || '').trim();
    if (rosterKey !== '') {
      return `roster:${rosterKey}`;
    }
    const token = String(row && row.token || '').trim();
    return token === '' ? '' : `token:${token}`;
  }

  static normalizeDistributionStatus_(status) {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'SUCCESS' || normalized === '配付済み') {
      return 'SUCCESS';
    }
    if (normalized === 'ERROR' || normalized === 'エラー') {
      return 'ERROR';
    }
    if (normalized === 'DRY_RUN') {
      return 'DRY_RUN';
    }
    if (normalized === 'DELETED' || normalized === 'DELETE_ERROR' || normalized === 'DELETE_SKIPPED') {
      return normalized;
    }
    return normalized;
  }

  static normalizeBatchSize_(value, fallback) {
    const numeric = Number(value || fallback || MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE;
    }
    return Math.max(1, Math.min(Math.floor(numeric), 100));
  }

  static toBoolean_(value, fallback) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (text === 'true') {
      return true;
    }
    if (text === 'false') {
      return false;
    }
    return fallback;
  }
}

class MonitorSnapshotService {
  static getDashboardSnapshotCacheKey_() {
    return 'molDrill:monitorDashboardSnapshot:v1';
  }

  static getDashboardSnapshotCacheTtlSeconds_() {
    return 90;
  }

  static getScriptCache_() {
    try {
      if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
        return CacheService.getScriptCache();
      }
    } catch (_ignored) {
      return null;
    }
    return null;
  }

  static createReadMetrics_() {
    return {
      cacheReadElapsedMs: 0,
      sheetReadElapsedMs: 0,
      jsonParseElapsedMs: 0,
      payloadBytes: 0,
      snapshotGeneratedAt: ''
    };
  }

  static buildDashboardSnapshot() {
    const generatedAt = new Date().toISOString();
    const liveData = buildMonitorDashboardData_();
    return {
      ...liveData,
      snapshotVersion: MOL_DRILL_MONITOR_SNAPSHOT_VERSION,
      source: 'monitor-snapshot',
      generatedAt,
      studentRuntime: 'fast',
      snapshotMode: 'snapshot',
      snapshotGeneratedAt: generatedAt,
      stale: false
    };
  }

  static writeDashboardSnapshot() {
    const snapshot = this.buildDashboardSnapshot();
    const json = JSON.stringify(snapshot);
    SheetRepository.upsertMonitorCacheRow({
      key: MOL_DRILL_MONITOR_DASHBOARD_CACHE_KEY,
      json,
      updatedAt: snapshot.generatedAt,
      note: '自動生成。直接編集しない'
    });
    this.writeDashboardSnapshotCache_(json);
    return snapshot;
  }

  static readDashboardSnapshot(metrics) {
    const timings = metrics || this.createReadMetrics_();
    const cacheSnapshot = this.readDashboardSnapshotFromCache_(timings);
    if (cacheSnapshot) {
      return cacheSnapshot;
    }
    return this.readDashboardSnapshotFromSheet_(timings);
  }

  static hasUsableDashboardSnapshot() {
    return this.readDashboardSnapshot() !== null;
  }

  static isUsableDashboardSnapshot_(snapshot) {
    return snapshot
      && typeof snapshot === 'object'
      && !Array.isArray(snapshot)
      && Array.isArray(snapshot.progressRows)
      && snapshot.dashboardMetrics
      && typeof snapshot.dashboardMetrics === 'object'
      && snapshot.courseOverview
      && typeof snapshot.courseOverview === 'object'
      && snapshot.studentOverview
      && typeof snapshot.studentOverview === 'object'
      && snapshot.tokenOverview
      && typeof snapshot.tokenOverview === 'object';
  }

  static readDashboardSnapshotFromCache_(metrics) {
    const cache = this.getScriptCache_();
    if (!cache) {
      return null;
    }
    const startedAtMs = Date.now();
    try {
      const json = String(cache.get(this.getDashboardSnapshotCacheKey_()) || '');
      metrics.cacheReadElapsedMs += Date.now() - startedAtMs;
      if (json.trim() === '') {
        return null;
      }
      return this.parseDashboardSnapshotJson_(json, '', metrics);
    } catch (error) {
      metrics.cacheReadElapsedMs += Date.now() - startedAtMs;
      LoggerService.logDeveloperInfo(`monitor dashboard snapshot CacheService read skipped. reason=${error && error.message ? error.message : String(error)}`);
      return null;
    }
  }

  static readDashboardSnapshotFromSheet_(metrics) {
    try {
      const sheetStartedAtMs = Date.now();
      const row = SheetRepository.readMonitorCacheRow(MOL_DRILL_MONITOR_DASHBOARD_CACHE_KEY);
      metrics.sheetReadElapsedMs += Date.now() - sheetStartedAtMs;
      if (!row || String(row.json || '').trim() === '') {
        return null;
      }
      const json = String(row.json || '');
      const snapshot = this.parseDashboardSnapshotJson_(json, String(row.updatedAt || ''), metrics);
      if (snapshot) {
        this.writeDashboardSnapshotCache_(json);
      }
      return snapshot;
    } catch (error) {
      LoggerService.logDeveloperInfo(`monitor dashboard snapshot unavailable; snapshot-missing will be returned. reason=${error && error.message ? error.message : String(error)}`);
      return null;
    }
  }

  static parseDashboardSnapshotJson_(json, fallbackGeneratedAt, metrics) {
    metrics.payloadBytes = String(json || '').length;
    const parseStartedAtMs = Date.now();
    let parsed = null;
    try {
      parsed = JSON.parse(String(json || ''));
    } catch (error) {
      metrics.jsonParseElapsedMs += Date.now() - parseStartedAtMs;
      LoggerService.logDeveloperInfo(`monitor dashboard snapshot JSON parse failed. reason=${error && error.message ? error.message : String(error)}`);
      return null;
    }
    metrics.jsonParseElapsedMs += Date.now() - parseStartedAtMs;
    if (!this.isUsableDashboardSnapshot_(parsed)) {
      return null;
    }
    const generatedAt = String(parsed.generatedAt || fallbackGeneratedAt || '');
    metrics.snapshotGeneratedAt = generatedAt;
    return {
      ...parsed,
      source: String(parsed.source || 'monitor-snapshot'),
      snapshotMode: 'snapshot',
      snapshotGeneratedAt: generatedAt,
      stale: parsed.stale === true
    };
  }

  static writeDashboardSnapshotCache_(json) {
    const cache = this.getScriptCache_();
    if (!cache) {
      return;
    }
    try {
      cache.put(this.getDashboardSnapshotCacheKey_(), String(json || ''), this.getDashboardSnapshotCacheTtlSeconds_());
    } catch (error) {
      LoggerService.logDeveloperInfo(`monitor dashboard snapshot CacheService write skipped. reason=${error && error.message ? error.message : String(error)}`);
    }
  }
}

// The teacher refresh cursor is durable. Cache eviction never loses the aggregation position.
class MonitorRefreshService {
  static emptyState_() {
    return { version: 1, cursor: 1, firstAttempt: '', lastAttempt: '', students: {}, target: 1, cutoffAt: '' };
  }

  static isUsableState_(state) {
    return state && state.version === 1 && Number.isInteger(state.cursor) && state.cursor >= 1
      && Number.isInteger(state.target) && state.target >= state.cursor && state.students && !Array.isArray(state.students)
      && typeof state.students === 'object';
  }

  static readState_(sheet) {
    this.stateValues_ = null;
    try {
      const cache = MonitorSnapshotService.getScriptCache_();
      const keys = JSON.parse(cache ? cache.get('monitorRefresh:manifest:v1') || 'null' : 'null');
      if (Array.isArray(keys) && keys.length && keys.length <= 200) {
        const parts = cache.getAll(keys);
        if (keys.every(key => typeof parts[key] === 'string')) {
          const state = JSON.parse(keys.map(key => parts[key]).join(''));
          if (this.isUsableState_(state)) return state;
        }
      }
    } catch (_) { /* Durable state remains the source if any cache piece is missing. */ }
    const headers = SheetRepository.getHeaderColumnMap_(sheet);
    if (!headers.key || !headers.json || !headers.updatedAt || !headers.note) throw new Error('管理スプレッドシートで「管理シートを作成・補修」を実行してください。');
    this.stateValues_ = sheet.getDataRange().getValues();
    const values = this.stateValues_.slice(1);
    const pieces = values.filter(row => String(row[headers.key - 1] || '').startsWith('refresh-state:'))
      .sort((a, b) => Number(String(a[headers.key - 1]).split(':')[1]) - Number(String(b[headers.key - 1]).split(':')[1]));
    try {
      const state = JSON.parse(pieces.map(row => String(row[headers.json - 1] || '')).join(''));
      if (this.isUsableState_(state)) { this.cacheState_(state); return state; }
    } catch (_) { /* Rebuild in bounded batches if the derived state is absent or damaged. */ }
    return this.emptyState_();
  }

  static cacheState_(state) {
    const cache = MonitorSnapshotService.getScriptCache_();
    if (!cache) return;
    try {
      const json = JSON.stringify(state);
      const revision = Utilities.getUuid();
      const pieces = {};
      const keys = [];
      for (let offset = 0; offset < json.length; offset += 25000) {
        const key = 'monitorRefresh:' + revision + ':' + keys.length;
        keys.push(key);
        pieces[key] = json.slice(offset, offset + 25000);
      }
      pieces['monitorRefresh:manifest:v1'] = JSON.stringify(keys);
      cache.putAll(pieces, 90);
    } catch (_) { try { cache.remove('monitorRefresh:manifest:v1'); } catch (ignored) {} }
  }

  static writeState_(sheet, state) {
    const headers = SheetRepository.getHeaderColumnMap_(sheet);
    const values = this.stateValues_ || sheet.getDataRange().getValues();
    const width = values[0].length;
    const kept = values.slice(1).filter(row => !String(row[headers.key - 1] || '').startsWith('refresh-state:'));
    const json = JSON.stringify(state);
    for (let offset = 0, index = 0; offset < json.length; offset += 30000, index++) {
      const row = new Array(width).fill('');
      row[headers.key - 1] = 'refresh-state:' + index;
      row[headers.json - 1] = json.slice(offset, offset + 30000);
      row[headers.updatedAt - 1] = new Date().toISOString();
      row[headers.note - 1] = '自動生成。直接編集しない';
      kept.push(row);
    }
    // One write commits the cursor together with its counters. Blank obsolete chunks in the same write.
    while (kept.length < values.length - 1) kept.push(new Array(width).fill(''));
    sheet.getRange(2, 1, kept.length, width).setValues(kept);
    this.stateValues_ = null;
    this.cacheState_(state);
  }

  static readRows_(name) {
    const sheet = SheetRepository.getManagedSheetWithoutSchemaCheck_(name);
    const values = sheet.getDataRange().getValues();
    const headers = values.shift() || [];
    return values.map(row => Object.fromEntries(headers.map((key, index) => [String(key), row[index]])));
  }

  static compare_(a, b) {
    return String(a.timestamp).localeCompare(String(b.timestamp)) || a.order - b.order;
  }

  static add_(state, entry, order) {
    const key = String(entry.rosterKey || '').trim();
    if (!key || TokenService.isTeacherTestStudentRosterKey(key)) return;
    if (!Object.prototype.hasOwnProperty.call(state.students, key)) {
      Object.defineProperty(state.students, key, { enumerable: true, writable: true, configurable: true,
        value: { attempts: 0, correct: 0, levels: {}, elapsedSum: 0, elapsedCount: 0,
          correctElapsedSum: 0, correctElapsedCount: 0, first: [], recent: [], lastValid: null } });
    }
    const item = state.students[key];
    const log = { timestamp: String(entry.timestamp || ''), order, level: String(entry.level || ''),
      problemType: String(entry.problemType || ''), isCorrect: entry.isCorrect === true, elapsedMs: Number(entry.elapsedMs || 0) };
    item.attempts++;
    item.correct += log.isCorrect ? 1 : 0;
    if (['beginner', 'intermediate', 'advanced', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6'].includes(log.level)) {
      const level = item.levels[log.level] || (item.levels[log.level] = { attempts: 0, correct: 0 });
      level.attempts++;
      level.correct += log.isCorrect ? 1 : 0;
    }
    item.first = item.first.concat(log).sort(this.compare_).slice(0, 10);
    item.recent = item.recent.concat(log).sort(this.compare_).slice(-10);
    if (AnswerService.isValidElapsedMs_(log.elapsedMs)) {
      item.elapsedSum += log.elapsedMs;
      item.elapsedCount++;
      if (log.isCorrect) { item.correctElapsedSum += log.elapsedMs; item.correctElapsedCount++; }
      if (!item.lastValid || this.compare_(item.lastValid, log) <= 0) item.lastValid = log;
    }
  }

  static summaries_(state) {
    return Object.entries(state.students).map(([rosterKey, item]) => {
      const latest = item.recent[item.recent.length - 1] || {};
      const recentCorrect = item.recent.filter(row => row.isCorrect).length;
      const firstAverage = AnswerService.averageElapsedMs_(item.first);
      const recentAverage = AnswerService.averageElapsedMs_(item.recent);
      const levels = {};
      for (const level of ['beginner', 'intermediate', 'advanced', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6']) {
        const count = item.levels[level] || { attempts: 0, correct: 0 };
        levels[level + 'Attempts'] = count.attempts;
        levels[level + 'Correct'] = count.correct;
        levels[level + 'Accuracy'] = AnswerService.roundRate_(count.correct, count.attempts);
        levels['recent10' + level[0].toUpperCase() + level.slice(1) + 'Attempts'] = item.recent.filter(row => row.level === level).length;
      }
      return { rosterKey, totalAttempts: item.attempts, totalCorrect: item.correct,
        totalAccuracy: AnswerService.roundRate_(item.correct, item.attempts), recent10Attempts: item.recent.length,
        recent10Correct: recentCorrect, recent10Accuracy: AnswerService.roundRate_(recentCorrect, item.recent.length), ...levels,
        lastAnsweredAt: latest.timestamp || '', lastLevel: latest.level || '', lastProblemType: latest.problemType || '',
        averageElapsedMs: item.elapsedCount ? Math.round(item.elapsedSum / item.elapsedCount) : 0,
        correctAverageElapsedMs: item.correctElapsedCount ? Math.round(item.correctElapsedSum / item.correctElapsedCount) : 0,
        recent10AverageElapsedMs: recentAverage, recent10MedianElapsedMs: AnswerService.medianElapsedMs_(item.recent),
        correctRecent10AverageElapsedMs: AnswerService.averageElapsedMs_(item.recent.filter(row => row.isCorrect)),
        first10AverageElapsedMs: firstAverage,
        speedImprovementRate: firstAverage > 0 && recentAverage > 0 ? AnswerService.roundDecimal_((firstAverage - recentAverage) / firstAverage, 4) : 0,
        lastElapsedMs: item.lastValid ? item.lastValid.elapsedMs : 0 };
    });
  }

  static dashboard_(state) {
    const students = this.readRows_('生徒名簿').map(row => ({ courseId: row.courseId, courseName: row.courseName,
      rosterKey: row.rosterKey, studentId: row.studentId, number: row['出席番号'], name: row['氏名'], status: row['状態'] }))
      .filter(row => row.rosterKey && !TokenService.isTeacherTestStudentRosterKey(row.rosterKey));
    const tokens = this.readRows_('トークン管理').map(row => SheetRepository.tokenObjectToRow_(row))
      .filter(row => row.rosterKey && !TokenService.isTeacherTestStudentRosterKey(row.rosterKey));
    const courses = this.readRows_('Classroom一覧').filter(row => row.courseId);
    const distribution = this.readRows_('配付ログ').map(row => ({ rosterKey: row.rosterKey, status: row.status }));
    const progressRows = AggregationService.buildAdminProgressRows(students, this.summaries_(state), tokens, distribution);
    const activeCount = students.filter(row => row.status !== '退籍').length;
    // The monitor has no all-time median column; do not report an uncomputed value as zero.
    progressRows.forEach(row => { delete row.medianElapsedMs; });
    return attachMonitorMaintenanceLinks_({ appName: MOL_DRILL_APP_NAME, appVersion: MOL_DRILL_APP_VERSION,
      generatedAt: new Date().toISOString(), snapshotGeneratedAt: state.cutoffAt, answersThrough: state.cutoffAt,
      snapshotMode: 'current', snapshotMissing: false, source: 'incremental-monitor', progressRows,
      courseOverview: { totalCount: courses.length, checkedCount: courses.filter(row => SheetRepository.isFlagEnabled_(row['同期対象'])).length },
      studentOverview: { totalCount: students.length, activeCount, retiredCount: students.length - activeCount },
      tokenOverview: { totalCount: tokens.length, activeCount: tokens.filter(row => row.token && !row.revoked).length, revokedCount: tokens.filter(row => row.revoked).length },
      dashboardMetrics: AggregationService.buildAdminDashboardMetrics(progressRows) });
  }

  static refresh_() {
    const stateSheet = SheetRepository.getManagedSheetWithoutSchemaCheck_('モニターキャッシュ');
    const logSheet = SheetRepository.getManagedSheetWithoutSchemaCheck_('解答ログ');
    const headers = SheetRepository.getHeaderColumnMap_(logSheet);
    if (!headers.attemptId || !headers.rosterKey || !headers.timestamp) throw new Error('管理スプレッドシートで「管理シートを作成・補修」を実行してください。');
    const observedAt = new Date().toISOString();
    const lastRow = Math.max(1, logSheet.getLastRow());
    let state = this.readState_(stateSheet);
    const attemptAt = row => row > 1 ? String(logSheet.getRange(row, headers.attemptId).getValue() || '') : '';
    if (state.cursor > lastRow || (state.cursor > 1 && (attemptAt(2) !== state.firstAttempt || attemptAt(state.cursor) !== state.lastAttempt))) {
      state = this.emptyState_();
    }
    if (state.cursor >= state.target) { state.target = lastRow; state.cutoffAt = observedAt; }
    const end = Math.min(state.target, state.cursor + 500);
    if (end > state.cursor) {
      const values = logSheet.getRange(state.cursor + 1, 1, end - state.cursor, logSheet.getLastColumn()).getValues();
      values.forEach((row, index) => this.add_(state, SheetRepository.answerLogObjectToRow_(SheetRepository.rowValuesToObject_(headers, row)), state.cursor + 1 + index));
      state.firstAttempt = attemptAt(2);
      state.lastAttempt = String(values[values.length - 1][headers.attemptId - 1] || '');
      state.cursor = end;
      this.writeState_(stateSheet, state);
    }
    const complete = state.cursor >= state.target;
    return { ok: true, complete, processed: Math.max(0, state.cursor - 1), total: Math.max(0, state.target - 1),
      data: complete ? this.dashboard_(state) : null };
  }
}

function refreshMonitorDashboard(authToken) {
  MonitorService.assertMonitorAccess(authToken);
  return AdminService.withAdminActionLock('refreshMonitorDashboard', () => MonitorRefreshService.refresh_());
}

function getCurrentMonitorStudentProblemTypeStats(authToken, rosterKey) {
  MonitorService.assertMonitorAccess(authToken);
  const key = String(rosterKey || '').trim();
  if (!key || TokenService.isTeacherTestStudentRosterKey(key)) return [];
  return AggregationService.buildProblemTypeStatsRows(SheetRepository.readAnswerLogsForRosterKey(key), new Date().toISOString());
}

class MonitorService {
  static isMonitorRoute(e) {
    const params = e && e.parameter ? e.parameter : {};
    return String(params.page || '').trim().toLowerCase() === 'monitor'
      || String(params.monitor || '').trim() === '1';
  }

  static assertMonitorAccess(authToken) {
    // Check authorization on every call; schema repair is a separate teacher operation.
    AdminService.assertAdminAccess(authToken);
  }

  static buildMonitorAccessDeniedHtml_(message) {
    const safeMessage = String(message || '管理シートを作成・補修してから、もう一度Webモニターを開いてください。')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return HtmlService.createHtmlOutput(`<!doctype html>
<html>
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, "Helvetica Neue", sans-serif; margin: 32px; color: #1f2937; line-height: 1.7; }
    .box { max-width: 720px; border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; background: #f9fafb; }
    h1 { font-size: 20px; margin: 0 0 12px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>モニター画面を開けません</h1>
    <p>${safeMessage}</p>
  </div>
</body>
</html>`).setTitle('モニター画面を開けません');
  }
}

function onOpen(e) {
  molDrillOnOpen(e);
}

function molDrillOnOpen(_e) {
  const ui = SpreadsheetApp.getUi();
  const setupMenu = ui.createMenu('⓪ 初期整備・保守')
    .addItem('⓪-1 管理シートを作成・補修', 'setupSheetsFromMenu')
    .addItem('⓪-2 管理データを全削除して初期状態に戻す', 'reinitializeSheetsFromMenu');
  const classroomMenu = ui.createMenu('① Classroom同期')
    .addItem('①-1 Classroom一覧を取得', 'refreshClassroomListFromMenu')
    .addItem('①-2 同期対象の説明を表示', 'showCourseSyncSelectionHelpFromMenu')
    .addItem('①-3 生徒名簿を取得', 'refreshStudentsForCheckedCoursesFromMenu');
  const studentUrlMenu = ui.createMenu('② 生徒URL')
    .addItem('②-1 トークンを発行', 'issueTokensForActiveStudentsFromMenu')
    .addItem('②-2 配付対象を確認', 'previewDistributionTargetsFromMenu')
    .addItem('②-3 DRY_RUNでURL配付確認', 'dryRunStudentUrlDistributionFromMenu')
    .addItem('②-4 URLをClassroomに配付', 'distributeStudentUrlsForCheckedCoursesFromMenu')
    .addItem('②-5 失敗分を再送', 'retryFailedStudentUrlDistributionsFromMenu');
  const cancellationMenu = ui.createMenu('③ 投稿・URL取消')
    .addItem('③-1 投稿削除=1 のURLを無効化してClassroom投稿を削除', 'deleteRequestedClassroomUrlPostsFromMenu');
  const individualSupportMenu = ui.createMenu('④ 個別対応')
    .addItem('④-1 選択行の教師プレビューURLを表示', 'showTeacherPreviewUrlForSelectedTokenRowFromMenu')
    .addItem('④-2 選択行のトークンを再発行', 'reissueSelectedStudentTokenFromMenu')
    .addItem('④-3 選択行のURLを無効化', 'revokeSelectedStudentTokenFromMenu');
  const autoRefreshMenu = ui.createMenu('⑤ 自動更新')
    .addItem('⑤-1 集計・モニター自動更新を有効化', 'installAggregateMonitorAutoRefreshTriggerFromMenu')
    .addItem('⑤-2 集計・モニター自動更新を停止', 'uninstallAggregateMonitorAutoRefreshTriggerFromMenu')
    .addItem('⑤-3 自動更新の状態を表示', 'showAggregateMonitorAutoRefreshStatusFromMenu');
  ui.createMenu(MOL_DRILL_APP_NAME)
    .addItem('★ 先生用URLを設定シートに出力', 'writeTeacherUrlsToSettingsFromMenu')
    .addItem('⑨ 集計キャッシュを更新', 'rebuildAggregateCacheFromMenu')
    .addSubMenu(setupMenu)
    .addSubMenu(classroomMenu)
    .addSubMenu(studentUrlMenu)
    .addSubMenu(cancellationMenu)
    .addSubMenu(individualSupportMenu)
    .addSubMenu(autoRefreshMenu)
    .addToUi();
}

function doGet(e) {
  const token = e && e.parameter ? String(e.parameter.t || e.parameter.token || '') : '';
  const params = e && e.parameter ? e.parameter : {};
  const isTeacherPreview = String(params.preview || '').trim() === 'teacher' || String(params.teacherPreview || '').trim() === '1';
  if (isTeacherPreview) {
    try {
      const adminToken = AdminService.extractTeacherPreviewAuthToken(e);
      AdminService.assertAdminAccess(adminToken);
      const previewTemplate = HtmlService.createTemplateFromFile('Student');
      previewTemplate.initialToken = token;
      previewTemplate.initialAdminToken = adminToken;
      previewTemplate.initialTeacherPreview = true;
      return previewTemplate.evaluate().setTitle(MOL_DRILL_APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME);
    } catch (error) {
      return HtmlService.createHtmlOutput(`<p>教師プレビューを開けません。</p><p>${String(error && error.message ? error.message : error)}</p>`).setTitle('教師プレビューアクセス不可');
    }
  }
  if (MonitorService.isMonitorRoute(e)) {
    try {
      const authToken = String(params.auth || '');
      MonitorService.assertMonitorAccess(authToken);
      const monitorTemplate = HtmlService.createTemplateFromFile('Monitor');
      monitorTemplate.initialAdminToken = authToken;
      monitorTemplate.initialReviewBenchmark = String(params.benchmark || '') === '1';
      if (monitorTemplate.initialReviewBenchmark) ReviewBenchmarkService.assertTestProject_();
      return monitorTemplate.evaluate().setTitle('もるくえ！ モニター').setSandboxMode(HtmlService.SandboxMode.IFRAME);
    } catch (error) {
      return MonitorService.buildMonitorAccessDeniedHtml_(String(error && error.message ? error.message : error));
    }
  }
  if (AdminService.isAdminRoute(e)) {
    return HtmlService.createHtmlOutput('<p>旧管理画面は廃止されました。授業中確認はWebモニター、準備・配付・保守はスプレッドシートの「もるくえ！」メニューを使ってください。</p>')
      .setTitle('旧管理画面は廃止されました');
  }
  const template = HtmlService.createTemplateFromFile('Student');
  template.initialToken = token;
  template.initialAdminToken = '';
  template.initialTeacherPreview = false;
  return template.evaluate().setTitle(MOL_DRILL_APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function buildMonitorWebAppUrl_(webAppUrl) {
  const normalizedWebAppUrl = String(webAppUrl || '').trim();
  if (normalizedWebAppUrl === '') {
    throw new Error('設定シートの WEB_APP_URL を先に設定してください。WebアプリをデプロイしたURLを入れてください。');
  }
  const separator = normalizedWebAppUrl.includes('?') ? '&' : '?';
  return `${normalizedWebAppUrl}${separator}page=monitor&auth=${encodeURIComponent(AdminService.getOrCreateAdminToken())}`;
}

function writeTeacherUrlsToSettings_() {
  SheetRepository.assertManagementSheetsReady();
  const webAppUrl = String(SheetRepository.getSettingValue('WEB_APP_URL') || '').trim();
  const monitorUrl = buildMonitorWebAppUrl_(webAppUrl);
  const testStudent = TokenService.ensureTeacherTestStudentToken(webAppUrl);
  SheetRepository.setSettingValues_([
    { key: 'MONITOR_URL', value: monitorUrl, description: MOL_DRILL_SETTING_DESCRIPTIONS.MONITOR_URL },
    { key: 'TEST_STUDENT_URL', value: testStudent.studentUrl, description: MOL_DRILL_SETTING_DESCRIPTIONS.TEST_STUDENT_URL }
  ]);
  const initialMonitorSnapshot = tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_();
  return {
    monitorUrl,
    testStudentUrl: testStudent.studentUrl,
    testStudent,
    initialMonitorSnapshot
  };
}

function tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_() {
  try {
    const snapshot = MonitorSnapshotService.writeDashboardSnapshot();
    return {
      ok: true,
      monitorSnapshotUpdatedAt: snapshot && snapshot.generatedAt ? snapshot.generatedAt : '',
      rowCount: snapshot && Array.isArray(snapshot.progressRows) ? snapshot.progressRows.length : 0
    };
  } catch (error) {
    LoggerService.logDeveloperError('Failed to build initial monitor snapshot after teacher URL setup', error);
    return {
      ok: false,
      message: AdminService.formatErrorMessage_(error)
    };
  }
}

function formatTeacherUrlsToSettingsMenuMessage_(result) {
  const initialSnapshot = result && result.initialMonitorSnapshot ? result.initialMonitorSnapshot : null;
  if (initialSnapshot && initialSnapshot.ok === true) {
    return [
      '先生用URLを設定シートに出力しました。',
      '設定シートの MONITOR_URL / TEST_STUDENT_URL を確認してください。',
      'モニター表示用キャッシュも初期作成しました。',
      'MONITOR_URL を開くとWebモニターを確認できます。'
    ].join('\n');
  }
  return [
    '先生用URLを設定シートに出力しました。',
    '設定シートの MONITOR_URL / TEST_STUDENT_URL を確認してください。',
    'モニター表示用キャッシュの初期作成はスキップされました。',
    'MONITOR_URL を開き、必要に応じて「モニターだけ更新」または「集計から完全更新」を押してください。'
  ].join('\n');
}

function summarizeTeacherUrlsToSettingsResult_(result) {
  const initialSnapshot = result && result.initialMonitorSnapshot ? result.initialMonitorSnapshot : null;
  return {
    processedCount: 3,
    successCount: initialSnapshot && initialSnapshot.ok === true ? 3 : 2,
    errorCount: 0,
    skippedCount: initialSnapshot && initialSnapshot.ok === true ? 0 : 1,
    nextAction: initialSnapshot && initialSnapshot.ok === true
      ? 'TEACHER_URLS_WRITTEN_INITIAL_MONITOR_SNAPSHOT_CREATED'
      : 'TEACHER_URLS_WRITTEN_INITIAL_MONITOR_SNAPSHOT_SKIPPED'
  };
}

function writeTeacherUrlsToSettingsFromMenu() {
  return runMenuOperation_(
    '先生用URLを設定シートに出力',
    'MENU_WRITE_TEACHER_URLS_TO_SETTINGS',
    () => AdminService.withAdminActionLock('writeTeacherUrlsToSettingsFromMenu', () => writeTeacherUrlsToSettings_()),
    formatTeacherUrlsToSettingsMenuMessage_,
    { summarizeResult: summarizeTeacherUrlsToSettingsResult_ }
  );
}

function showMonitorWebAppUrlFromMenu() {
  return writeTeacherUrlsToSettingsFromMenu();
}

function getSelectedTokenManagementRowFromMenu_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = spreadsheet && spreadsheet.getActiveSheet ? spreadsheet.getActiveSheet() : null;
  const activeRange = spreadsheet && spreadsheet.getActiveRange ? spreadsheet.getActiveRange() : null;
  if (!activeSheet || activeSheet.getName() !== 'トークン管理') {
    throw new Error('トークン管理 シートで対象生徒の行を1行だけ選択してから実行してください。');
  }
  if (!activeRange || typeof activeRange.getNumRows !== 'function' || activeRange.getNumRows() !== 1) {
    throw new Error('トークン管理 シートで対象生徒の行を1行だけ選択してから実行してください。');
  }
  const rowIndex = activeRange.getRow();
  if (rowIndex <= 1) {
    throw new Error('ヘッダー行ではなく、生徒の行を選択してください。');
  }
  const lastColumn = activeSheet.getLastColumn();
  const headers = activeSheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((header) => String(header || '').trim());
  const row = activeSheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
  const isEmptyRow = row.every((value) => String(value == null ? '' : value).trim() === '');
  if (isEmptyRow) {
    throw new Error('選択行は空行です。トークン管理 シートで対象生徒の行を選択してください。');
  }
  const headerMap = {};
  headers.forEach((header, index) => {
    if (header !== '' && headerMap[header] == null) {
      headerMap[header] = index;
    }
  });
  const read = (header) => {
    const index = headerMap[header];
    return index == null ? '' : String(row[index] == null ? '' : row[index]).trim();
  };
  const rosterKey = read('rosterKey');
  if (rosterKey === '') {
    throw new Error('選択行の rosterKey が空です。生徒名簿とトークン管理を確認してください。');
  }
  const revokedValue = read('revoked');
  return {
    rowIndex,
    headers,
    row,
    token: read('token'),
    courseId: read('courseId'),
    courseName: read('courseName'),
    rosterKey,
    studentId: read('studentId'),
    number: read('出席番号'),
    name: read('氏名'),
    email: read('メール'),
    studentUrl: read('studentUrl'),
    revoked: SheetRepository.isFlagEnabled_(revokedValue),
    postDeletion: read('投稿削除'),
    note: read('note')
  };
}

function formatSelectedTokenStudentLabel_(selected) {
  const number = String(selected && selected.number ? selected.number : '').trim();
  const name = String(selected && selected.name ? selected.name : '').trim();
  const rosterKey = String(selected && selected.rosterKey ? selected.rosterKey : '').trim();
  const displayName = name !== '' ? name : rosterKey;
  return number !== '' ? `${number}番 ${displayName}` : displayName;
}

function getSelectedTokenManagementRowForMenuAction_(label) {
  const ui = SpreadsheetApp.getUi();
  try {
    return getSelectedTokenManagementRowFromMenu_();
  } catch (error) {
    const message = AdminService.formatErrorMessage_(error);
    LoggerService.logDeveloperError(`${label} selection failed`, error);
    ui.alert(`${label}に失敗しました:\n${message}`);
    throw error;
  }
}

function showTeacherPreviewUrlForSelectedTokenRowFromMenu() {
  const label = '選択行の教師プレビューURLを表示';
  const ui = SpreadsheetApp.getUi();
  try {
    const selected = getSelectedTokenManagementRowFromMenu_();
    if (selected.token === '') {
      throw new Error('選択行の token が空です。先に ②-1 トークンを発行 を実行してください。');
    }
    if (selected.revoked) {
      throw new Error('このURLはすでに無効化済みです。有効なURLの行を選択してください。');
    }
    const adminToken = AdminService.getOrCreateAdminToken();
    const previewUrl = AdminService.buildTeacherStudentPreviewUrl(adminToken, selected.token);
    ui.alert(
      '教師プレビューURL',
      `対象: ${formatSelectedTokenStudentLabel_(selected)}\n\n教師プレビューURL:\n${previewUrl}\n\n先生用プレビューURLです。生徒には共有しないでください。`,
      ui.ButtonSet.OK
    );
    return previewUrl;
  } catch (error) {
    const message = AdminService.formatErrorMessage_(error);
    LoggerService.logDeveloperError(`${label} failed`, error);
    ui.alert(`${label}に失敗しました:\n${message}`);
    throw error;
  }
}

function reissueSelectedStudentTokenFromMenu() {
  const label = '選択行のトークンを再発行';
  const selected = getSelectedTokenManagementRowForMenuAction_(label);
  const studentLabel = formatSelectedTokenStudentLabel_(selected);
  return runMenuOperation_(
    label,
    'MENU_REISSUE_SELECTED_STUDENT_TOKEN',
    () => AdminService.withAdminActionLock('reissueSelectedStudentTokenFromMenu', () => TokenService.reissueStudentToken(selected.rosterKey, {})),
    (updated) => `選択行のトークンを再発行しました。\n対象: ${studentLabel}\n新しいURL:\n${updated.studentUrl}\n\nClassroom投稿は自動では更新されません。必要に応じて先生が新URLを扱ってください。`,
    {
      confirmMessage: `対象: ${studentLabel}\n\nこの生徒のトークンを再発行します。古いURLは使わない運用になります。\nClassroom投稿は自動では更新されません。必要に応じて新URLを先生が扱ってください。`,
      summarizeResult: () => ({ processedCount: 1, successCount: 1, errorCount: 0, skippedCount: 0, nextAction: 'DONE' })
    }
  );
}

function revokeSelectedStudentTokenFromMenu() {
  const label = '選択行のURLを無効化';
  const ui = SpreadsheetApp.getUi();
  const selected = getSelectedTokenManagementRowForMenuAction_(label);
  const studentLabel = formatSelectedTokenStudentLabel_(selected);
  if (selected.token === '') {
    const message = '選択行の token が空です。先に ②-1 トークンを発行 を実行してください。';
    ui.alert(`${label}に失敗しました:\n${message}`);
    throw new Error(message);
  }
  if (selected.revoked) {
    ui.alert(label, `対象: ${studentLabel}\n\nこのURLはすでに無効化済みです。`, ui.ButtonSet.OK);
    return null;
  }
  return runMenuOperation_(
    label,
    'MENU_REVOKE_SELECTED_STUDENT_TOKEN',
    () => AdminService.withAdminActionLock('revokeSelectedStudentTokenFromMenu', () => TokenService.revokeStudentToken(selected.rosterKey)),
    () => `選択行のURLを無効化しました。\n対象: ${studentLabel}\n\nClassroom投稿自体は削除していません。投稿も消したい場合は、トークン管理の 投稿削除 に 1 を入力して ③ 投稿・URL取消 を使ってください。`,
    {
      confirmMessage: `対象: ${studentLabel}\n\nこのURLを無効化します。生徒はこのURLで入れなくなります。\nClassroom投稿自体は削除しません。Classroom投稿も消したい場合は、トークン管理の 投稿削除 に 1 を入力して ③ 投稿・URL取消 を使ってください。`,
      summarizeResult: () => ({ processedCount: 1, successCount: 1, errorCount: 0, skippedCount: 0, nextAction: 'DONE' })
    }
  );
}

function setupSheets() {
  SpreadsheetApp.getUi(); // Spreadsheet/editor context only; unavailable to Web App RPC.
  return SheetRepository.ensureSheets();
}

function runMenuOperation_(label, operationName, callback, formatSuccessMessage, options) {
  const ui = SpreadsheetApp.getUi();
  const normalizedOptions = options || {};
  try {
    if (normalizedOptions.confirmMessage) {
      const response = ui.alert(label, normalizedOptions.confirmMessage, ui.ButtonSet.OK_CANCEL);
      if (response !== ui.Button.OK) {
        ui.alert(`${label}をキャンセルしました。`);
        return null;
      }
    }
    const result = AdminService.runLoggedOperation(operationName, callback, normalizedOptions.summarizeResult);
    const message = typeof formatSuccessMessage === 'function'
      ? formatSuccessMessage(result)
      : `${label}が完了しました。`;
    SpreadsheetApp.getUi().alert(message);
    return result;
  } catch (error) {
    const message = AdminService.formatErrorMessage_(error);
    LoggerService.logDeveloperError(`${label} failed`, error);
    SpreadsheetApp.getUi().alert(`${label}に失敗しました:\n${message}`);
    throw error;
  }
}

function readAdminSettingsForMenu_() {
  SheetRepository.assertManagementSheetsReady();
  return AdminService.readAdminSettings_();
}

function promptMenuText_(label, message) {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(label, message, ui.ButtonSet.OK_CANCEL);
  if (!response || response.getSelectedButton() !== ui.Button.OK) {
    ui.alert(`${label}をキャンセルしました。`);
    return null;
  }
  return String(response.getResponseText() == null ? '' : response.getResponseText()).trim();
}

function parseMenuBoolean_(value, label) {
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 'はい', '有効', 'オン', 'する'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off', 'いいえ', '無効', 'オフ', 'しない'].includes(normalized)) {
    return false;
  }
  throw new Error(`${label} は true または false で入力してください。`);
}

function promptMenuBoolean_(label, settingLabel, currentValue, description) {
  const text = promptMenuText_(
    label,
    `${description}\n現在値: ${currentValue ? 'true' : 'false'}\ntrue または false で入力してください。空欄なら現在値のままです。`
  );
  if (text === null) {
    return null;
  }
  return text === '' ? currentValue === true : parseMenuBoolean_(text, settingLabel);
}

function promptMenuBatchSize_(label, currentValue) {
  const text = promptMenuText_(
    label,
    `Classroom URL配付の1回あたり最大件数を入力してください。\n現在値: ${currentValue}\n1から100の整数を入力してください。空欄なら現在値のままです。`
  );
  if (text === null) {
    return null;
  }
  if (text === '') {
    return currentValue;
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('1回あたり最大件数は1から100の数値で入力してください。');
  }
  return AdminService.normalizeBatchSize_(numeric, MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE);
}

function promptMenuPositiveNumber_(label, settingLabel, currentValue, description) {
  const currentValueText = formatMenuNumberForDisplay_(currentValue);
  const text = promptMenuText_(
    label,
    `${description}\n現在値: ${currentValueText}\n正の数で入力してください。例: 6.02×10^23, 6.02x10^23, 0.01\n空欄なら現在値のままです。`
  );
  if (text === null) {
    return null;
  }
  if (text === '') {
    return currentValue;
  }
  const numeric = MolProblemService.normalizeNumericInput(text);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${settingLabel} は正の数で入力してください。`);
  }
  return numeric;
}

function formatMenuNumberForDisplay_(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && Math.abs(numeric) >= 1e6) {
    return MolProblemService.formatScientific_(numeric, 3);
  }
  return String(value == null ? '' : value);
}

function normalizeMenuPostText_(text) {
  return String(text || '').replace(/\\n/g, '\n');
}

function setupSheetsFromMenu() {
  return runMenuOperation_(
    '管理シートを作成・補修',
    'MENU_SETUP_SHEETS',
    () => setupSheets(),
    (result) => result.message || '管理シートを作成・補修しました。'
  );
}

function configureWebAppUrlFromMenu() {
  const settings = readAdminSettingsForMenu_();
  const text = promptMenuText_(
    'WebアプリURLを設定',
    `生徒が開くWebアプリのURLを入力してください。\n現在値: ${settings.webAppUrl || '(未設定)'}\n空欄なら現在値のままです。`
  );
  if (text === null) {
    return null;
  }
  const webAppUrl = text === '' ? settings.webAppUrl : text;
  return runMenuOperation_(
    'WebアプリURLを設定',
    'MENU_CONFIGURE_WEB_APP_URL',
    () => AdminService.saveSettingsFromMenu({ webAppUrl }),
    () => 'WebアプリURLを設定しました。'
  );
}

function configureClassroomPostTextFromMenu() {
  const settings = readAdminSettingsForMenu_();
  const text = promptMenuText_(
    'Classroom投稿文を設定',
    `Classroomへ投稿する本文テンプレートを入力してください。\n改行は \\n と入力できます。{{studentUrl}} は生徒URLに置き換わります。\n現在値:\n${String(settings.postTextTemplate || '').replace(/\n/g, '\\n')}\n空欄なら現在値のままです。`
  );
  if (text === null) {
    return null;
  }
  const postTextTemplate = text === '' ? settings.postTextTemplate : normalizeMenuPostText_(text);
  return runMenuOperation_(
    'Classroom投稿文を設定',
    'MENU_CONFIGURE_CLASSROOM_POST_TEXT',
    () => {
      if (!/\{\{\s*studentUrl\s*\}\}/.test(postTextTemplate)) {
        throw new Error('設定シートの POST_TEXT_TEMPLATE に {{studentUrl}} を含めてください。');
      }
      return AdminService.saveSettingsFromMenu({ postTextTemplate });
    },
    () => 'Classroom投稿文を設定しました。'
  );
}

function configureDistributionSettingsFromMenu() {
  const settings = readAdminSettingsForMenu_();
  const dryRun = promptMenuBoolean_(
    '配付設定を変更: DRY_RUN',
    'DRY_RUN',
    settings.dryRun,
    'true の場合、Classroom投稿を作成せず配付ログだけ記録します。'
  );
  if (dryRun === null) {
    return null;
  }
  const batchSize = promptMenuBatchSize_('配付設定を変更: 1回の最大配付件数', settings.batchSize);
  if (batchSize === null) {
    return null;
  }
  const enableDistributionLog = promptMenuBoolean_(
    '配付設定を変更: 配付ログ',
    '配付ログ',
    settings.enableDistributionLog,
    'true の場合、配付結果を配付ログへ記録します。'
  );
  if (enableDistributionLog === null) {
    return null;
  }
  return runMenuOperation_(
    '配付設定を変更',
    'MENU_CONFIGURE_DISTRIBUTION_SETTINGS',
    () => AdminService.saveSettingsFromMenu({ dryRun, batchSize, enableDistributionLog }),
    () => '配付設定を変更しました。'
  );
}

function configureProblemSettingsFromMenu() {
  const settings = readAdminSettingsForMenu_();
  const adaptiveProblemSelection = promptMenuBoolean_(
    '出題・採点設定を変更: 適応出題',
    '適応出題',
    settings.adaptiveProblemSelection,
    'true の場合、生徒ごとの問題タイプ別キャッシュを使って出題タイプを調整します。'
  );
  if (adaptiveProblemSelection === null) {
    return null;
  }
  const beginnerAvogadroConstant = promptMenuPositiveNumber_(
    '出題・採点設定を変更: 初級アボガドロ定数',
    '初級アボガドロ定数',
    settings.beginnerAvogadroConstant,
    '初級レベルの問題生成と採点に使うアボガドロ定数です。'
  );
  if (beginnerAvogadroConstant === null) {
    return null;
  }
  const beginnerTolerance = promptMenuPositiveNumber_(
    '出題・採点設定を変更: 初級許容誤差',
    '初級許容誤差',
    settings.beginnerTolerance,
    '初級レベルの数値解答に使う相対許容誤差です。'
  );
  if (beginnerTolerance === null) {
    return null;
  }
  const intermediateAvogadroConstant = promptMenuPositiveNumber_(
    '出題・採点設定を変更: 中級アボガドロ定数',
    '中級アボガドロ定数',
    settings.intermediateAvogadroConstant,
    '中級レベルの問題生成と採点に使うアボガドロ定数です。'
  );
  if (intermediateAvogadroConstant === null) {
    return null;
  }
  const intermediateTolerance = promptMenuPositiveNumber_(
    '出題・採点設定を変更: 中級許容誤差',
    '中級許容誤差',
    settings.intermediateTolerance,
    '中級レベルの数値解答に使う相対許容誤差です。'
  );
  if (intermediateTolerance === null) {
    return null;
  }
  const advancedAvogadroConstant = promptMenuPositiveNumber_(
    '出題・採点設定を変更: 上級アボガドロ定数',
    '上級アボガドロ定数',
    settings.advancedAvogadroConstant,
    '上級レベルの問題生成と採点に使うアボガドロ定数です。'
  );
  if (advancedAvogadroConstant === null) {
    return null;
  }
  const advancedTolerance = promptMenuPositiveNumber_(
    '出題・採点設定を変更: 上級許容誤差',
    '上級許容誤差',
    settings.advancedTolerance,
    '上級レベルの数値解答に使う相対許容誤差です。'
  );
  if (advancedTolerance === null) {
    return null;
  }
  return runMenuOperation_(
    '出題・採点設定を変更',
    'MENU_CONFIGURE_PROBLEM_SETTINGS',
    () => AdminService.saveSettingsFromMenu({
      adaptiveProblemSelection,
      beginnerAvogadroConstant,
      beginnerTolerance,
      intermediateAvogadroConstant,
      intermediateTolerance,
      advancedAvogadroConstant,
      advancedTolerance
    }),
    () => '出題・採点設定を変更しました。'
  );
}

function reinitializeSheets() {
  SpreadsheetApp.getUi(); // Spreadsheet/editor context only; unavailable to Web App RPC.
  return SheetRepository.reinitializeSheets();
}

function reinitializeSheetsFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const label = '管理データを全削除して初期状態に戻す';
  const message = `管理データを全削除して初期状態に戻します。

削除されるもの:
- Classroom一覧
- 生徒名簿
- トークン管理
- 解答ログ
- 配付ログ
- 集計キャッシュ
- 問題タイプ別キャッシュ
- 実行ログ
- 設定シートの保存内容

バックアップは作成しません。
この操作は元に戻せません。

実行しますか？`;
  const response = ui.alert(label, message, ui.ButtonSet.OK_CANCEL);
  if (response !== ui.Button.OK) {
    return null;
  }
  return runMenuOperation_(
    label,
    'MENU_REINITIALIZE_SHEETS',
    () => reinitializeSheets(),
    (result) => result.message || '管理データを全削除して初期状態に戻しました。'
  );
}

function refreshClassroomListCore_() {
  const courses = ClassroomService.listTeacherCourses();
  SheetRepository.writeCourseListToSheet(courses);
  return courses;
}

function refreshClassroomList(authToken) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('refreshClassroomList', () => AdminService.runLoggedOperation(
    'REFRESH_CLASSROOM_LIST',
    () => refreshClassroomListCore_()
  ));
}

function refreshClassroomListFromMenu() {
  return runMenuOperation_(
    'Classroom一覧を取得',
    'MENU_REFRESH_CLASSROOM_LIST',
    () => AdminService.withAdminActionLock('refreshClassroomListFromMenu', () => refreshClassroomListCore_()),
    (courses) => `Classroom一覧を取得しました: ${courses.length}件`
  );
}

function showCourseSyncSelectionHelpFromMenu() {
  const message = `Classroom一覧シートの「同期対象」列で、今回使うClassroomだけに 1 を入力してください。

同期対象にしたClassroomだけ、生徒名簿取得、トークン発行、URL配付の対象になります。
使わないClassroomは空欄にします。`;
  SpreadsheetApp.getUi().alert(message);
  return message;
}

function refreshStudentsForCheckedCoursesCore_() {
  const checkedCourses = SheetRepository.getCheckedCourses();
  if (checkedCourses.length === 0) {
    throw new Error('Classroom一覧シートで同期対象を1件以上チェックしてください。');
  }
  const students = [];
  for (const course of checkedCourses) {
    const courseStudents = ClassroomService.listStudents(course.courseId).map((student) => ({
      ...student,
      courseName: course.name
    }));
    students.push(...courseStudents);
  }
  SheetRepository.writeStudentsToSheet(students, checkedCourses);
  return students;
}

function refreshStudentsForCheckedCourses(authToken) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('refreshStudentsForCheckedCourses', () => AdminService.runLoggedOperation(
    'REFRESH_STUDENT_ROSTER',
    () => refreshStudentsForCheckedCoursesCore_()
  ));
}

function refreshStudentsForCheckedCoursesFromMenu() {
  return runMenuOperation_(
    '生徒名簿を取得',
    'MENU_REFRESH_STUDENT_ROSTER',
    () => AdminService.withAdminActionLock('refreshStudentsForCheckedCoursesFromMenu', () => refreshStudentsForCheckedCoursesCore_()),
    (students) => `生徒名簿を取得しました: ${SheetRepository.getCheckedCourses().length}クラス / ${students.length}人`
  );
}

function issueTokensForCheckedCourses(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('issueTokensForCheckedCourses', () => AdminService.runLoggedOperation(
    'ISSUE_TOKENS_CHECKED_COURSES',
    () => TokenService.issueTokensForCheckedCourses(options || {})
  ));
}

function issueTokensForActiveStudents(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('issueTokensForActiveStudents', () => AdminService.runLoggedOperation(
    'ISSUE_TOKENS_ACTIVE_STUDENTS',
    () => TokenService.issueTokensForActiveStudents(options || {})
  ));
}

function issueTokensForActiveStudentsFromMenu() {
  return runMenuOperation_(
    'トークンを発行',
    'MENU_ISSUE_TOKENS_ACTIVE_STUDENTS',
    () => AdminService.withAdminActionLock('issueTokensForActiveStudentsFromMenu', () => TokenService.issueTokensForActiveStudents({})),
    (result) => `トークンを発行しました: ${result.issued || 0}人`
  );
}

function reissueStudentToken(authToken, rosterKey, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('reissueStudentToken', () => AdminService.runLoggedOperation(
    'REISSUE_STUDENT_TOKEN',
    () => TokenService.reissueStudentToken(rosterKey, options || {}),
    () => ({ processedCount: 1, successCount: 1, errorCount: 0, skippedCount: 0, nextAction: 'DONE' })
  ));
}

function revokeStudentToken(authToken, rosterKey) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('revokeStudentToken', () => AdminService.runLoggedOperation(
    'REVOKE_STUDENT_TOKEN',
    () => TokenService.revokeStudentToken(rosterKey),
    () => ({ processedCount: 1, successCount: 1, errorCount: 0, skippedCount: 0, nextAction: 'DONE' })
  ));
}

function validateStudentToken(token) {
  return TokenService.validateToken(token);
}

function distributeStudentUrlsForCheckedCourses(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('distributeStudentUrlsForCheckedCourses', () => DistributionService.distributeStudentUrlsForCheckedCourses(options || {}));
}

function distributeStudentUrlsForCheckedCoursesFromMenu() {
  return runMenuOperation_(
    'URLをClassroomに配付',
    'MENU_CLASSROOM_URL_DISTRIBUTION',
    () => AdminService.withAdminActionLock('distributeStudentUrlsForCheckedCoursesFromMenu', () => DistributionService.distributeStudentUrlsForCheckedCourses({ dryRun: false })),
    (result) => `URLをClassroomに配付しました: 処理 ${result.processed || 0}件 / 成功 ${result.success || 0}件 / 失敗 ${result.error || 0}件`,
    { confirmMessage: 'Classroomへ個別URLを本送信します。DRY_RUNで配付対象を確認済みの場合だけ実行してください。' }
  );
}

function getDistributionTargetsPreview(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return DistributionService.getDistributionTargetsPreview(options || {});
}

function previewDistributionTargetsFromMenu() {
  return runMenuOperation_(
    '配付対象を確認',
    'MENU_DISTRIBUTION_TARGET_PREVIEW',
    () => DistributionService.getDistributionTargetsPreview({}),
    (preview) => `配付対象を確認しました: 配付待ち ${preview.targetCount || 0}件 / 失敗再送 ${preview.failedTargetCount || 0}件 / バッチサイズ ${preview.batchSize || 0}`
  );
}

function dryRunStudentUrlDistribution(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('dryRunStudentUrlDistribution', () => DistributionService.distributeStudentUrlsForCheckedCourses({
    ...(options || {}),
    dryRun: true
  }));
}

function dryRunStudentUrlDistributionFromMenu() {
  return runMenuOperation_(
    'DRY_RUNでURL配付確認',
    'MENU_CLASSROOM_URL_DISTRIBUTION_DRY_RUN',
    () => AdminService.withAdminActionLock('dryRunStudentUrlDistributionFromMenu', () => DistributionService.distributeStudentUrlsForCheckedCourses({ dryRun: true })),
    (result) => `DRY_RUNでURL配付確認を実行しました: 処理 ${result.processed || 0}件 / ログ ${result.logs ? result.logs.length : 0}件`
  );
}

function retryFailedStudentUrlDistributions(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('retryFailedStudentUrlDistributions', () => DistributionService.retryFailedStudentUrlDistributions(options || {}));
}

function retryFailedStudentUrlDistributionsFromMenu() {
  return runMenuOperation_(
    '失敗分を再送',
    'MENU_RETRY_FAILED_CLASSROOM_URL_DISTRIBUTION',
    () => AdminService.withAdminActionLock('retryFailedStudentUrlDistributionsFromMenu', () => DistributionService.retryFailedStudentUrlDistributions({})),
    (result) => `失敗分を再送しました: 処理 ${result.processed || 0}件 / 成功 ${result.success || 0}件 / 失敗 ${result.error || 0}件`,
    { confirmMessage: '配付ログでERRORになっている生徒だけ再送します。' }
  );
}

function deleteRequestedClassroomUrlPosts(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('deleteRequestedClassroomUrlPosts', () => DistributionService.deleteRequestedClassroomUrlPosts(options || {}));
}

function deleteRequestedClassroomUrlPostsFromMenu() {
  const label = '投稿削除=1 のURLを無効化してClassroom投稿を削除';
  const confirmMessage = `トークン管理 シートの 投稿削除 列に 1 が入力されている生徒だけを対象にします。

対象生徒のURLを無効化します。
対応するClassroom投稿を削除します。
解答ログや集計データは削除しません。
実行後、revoked は 済 になります。
投稿削除に成功した行は、投稿削除 が 済 になります。
失敗した行は、投稿削除 が 失敗 になります。
対応するClassroom投稿が見つからない行は、投稿削除 が 対象なし になります。
再実行したい場合は、投稿削除 を再度 1 にしてください。
投稿削除は元に戻せない可能性があります。

実行しますか？`;
  return runMenuOperation_(
    label,
    'MENU_DELETE_REQUESTED_CLASSROOM_URL_POSTS',
    () => AdminService.withAdminActionLock('deleteRequestedClassroomUrlPostsFromMenu', () => DistributionService.deleteRequestedClassroomUrlPosts()),
    (result) => result.message || `投稿削除=1 のURL無効化とClassroom投稿削除を実行しました: 対象 ${result.targetStudents || 0}人 / 無効化 ${result.revokedCount || 0}件 / 投稿削除成功 ${result.success || 0}件 / 投稿削除失敗 ${result.error || 0}件 / スキップ ${(result.skipped || 0) + (result.noTarget || 0)}件`,
    { confirmMessage }
  );
}

function deleteLatestClassroomUrlDistribution(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('deleteLatestClassroomUrlDistribution', () => DistributionService.deleteLatestClassroomUrlDistribution(options || {}));
}

function deleteClassroomUrlDistributionByRunId(authToken, runId, options) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('deleteClassroomUrlDistributionByRunId', () => DistributionService.deleteClassroomUrlDistributionByRunId(runId, options || {}));
}

function deleteLatestClassroomUrlDistributionFromMenu() {
  const label = '直近のClassroom URL配付投稿を削除';
  const confirmMessage = `直近の本送信URL配付投稿をClassroomから削除します。

この操作で削除するのは、配付ログにClassroom投稿IDが残っている直近runの投稿だけです。
生徒のトークンや解答ログは削除しません。
投稿削除は元に戻せない可能性があります。
誤配付時や配付取り消し時だけ使う保守操作です。

実行しますか？`;
  return runMenuOperation_(
    label,
    'MENU_DELETE_LATEST_CLASSROOM_URL_DISTRIBUTION',
    () => AdminService.withAdminActionLock('deleteLatestClassroomUrlDistributionFromMenu', () => DistributionService.deleteLatestClassroomUrlDistribution()),
    (result) => result.message || `直近のClassroom URL配付投稿を削除しました: 元runId ${result.sourceRunId || '(対象なし)'} / 処理 ${result.processed || 0}件 / 成功 ${result.success || 0}件 / 失敗 ${result.error || 0}件`,
    { confirmMessage }
  );
}

function getDistributionLogs(authToken) {
  AdminService.assertAdminAccess(authToken);
  return SheetRepository.readDistributionLogs();
}

function rebuildAggregateCache(authToken) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('rebuildAggregateCache', () => AdminService.runLoggedOperation(
    'REBUILD_AGGREGATE_CACHE',
    () => AggregationService.rebuildAggregateCache()
  ));
}

function summarizeAggregateMonitorCacheResult_(result) {
  const source = result && typeof result === 'object' ? result : {};
  const updated = Number(source.updated || 0);
  const problemTypeUpdated = Number(source.problemTypeUpdated || 0);
  const processedCount = (Number.isFinite(updated) ? updated : 0) + (Number.isFinite(problemTypeUpdated) ? problemTypeUpdated : 0);
  return {
    processedCount,
    successCount: processedCount,
    errorCount: Number(source.error || source.errorCount || 0),
    skippedCount: Number(source.skipped || source.skippedCount || 0),
    nextAction: String(source.nextAction || 'DONE')
  };
}

function rebuildAggregateAndMonitorCacheCore_() {
  const result = AggregationService.rebuildAggregateCache();
  const snapshot = MonitorSnapshotService.writeDashboardSnapshot();
  const monitorSnapshotUpdatedAt = snapshot && snapshot.generatedAt ? snapshot.generatedAt : '';
  return {
    ...result,
    monitorSnapshotUpdatedAt,
    nextAction: monitorSnapshotUpdatedAt
      ? `MONITOR_CACHE_UPDATED:${monitorSnapshotUpdatedAt}; PROBLEM_TYPE_ROWS:${result.problemTypeUpdated || 0}`
      : `MONITOR_CACHE_UPDATE_SKIPPED; PROBLEM_TYPE_ROWS:${result.problemTypeUpdated || 0}`
  };
}

function rebuildAggregateCacheFromMenu() {
  return runMenuOperation_(
    '集計キャッシュを更新',
    'MENU_REBUILD_AGGREGATE_CACHE',
    () => AdminService.withAdminActionLock('rebuildAggregateCacheFromMenu', () => {
      const result = rebuildAggregateAndMonitorCacheCore_();
      MonitorRefreshService.writeState_(SheetRepository.getManagedSheetWithoutSchemaCheck_('モニターキャッシュ'), MonitorRefreshService.emptyState_());
      return result;
    }),
    (result) => `集計キャッシュを更新しました: ${result.updated || 0}人 / 問題タイプ別 ${result.problemTypeUpdated || 0}行 / モニターキャッシュ ${result.monitorSnapshotUpdatedAt || '未更新'}`,
    { summarizeResult: summarizeAggregateMonitorCacheResult_ }
  );
}

function formatMonitorRebuildCacheResponse_(result) {
  const source = result && typeof result === 'object' ? result : {};
  const problemTypeRows = Number(source.problemTypeUpdated != null
    ? source.problemTypeUpdated
    : (Array.isArray(source.problemTypeRows) ? source.problemTypeRows.length : 0));
  return {
    ok: true,
    updated: Number(source.updated || 0),
    problemTypeRows: Number.isFinite(problemTypeRows) ? problemTypeRows : 0,
    monitorSnapshotUpdatedAt: String(source.monitorSnapshotUpdatedAt || ''),
    message: '集計キャッシュとモニターキャッシュを更新しました。'
  };
}

function summarizeMonitorSnapshotRebuildResult_(result) {
  const source = result && typeof result === 'object' ? result : {};
  const rows = Array.isArray(source.progressRows) ? source.progressRows : [];
  const rowCount = rows.length;
  const monitorSnapshotUpdatedAt = String(source.generatedAt || source.snapshotGeneratedAt || '');
  return {
    processedCount: rowCount,
    successCount: rowCount,
    errorCount: Number(source.error || source.errorCount || 0),
    skippedCount: Number(source.skipped || source.skippedCount || 0),
    nextAction: monitorSnapshotUpdatedAt
      ? `MONITOR_SNAPSHOT_UPDATED:${monitorSnapshotUpdatedAt}; ROWS:${rowCount}`
      : `MONITOR_SNAPSHOT_UPDATE_SKIPPED; ROWS:${rowCount}`
  };
}

function formatMonitorSnapshotRebuildResponse_(result) {
  const source = result && typeof result === 'object' ? result : {};
  const rows = Array.isArray(source.progressRows) ? source.progressRows : [];
  return {
    ok: true,
    monitorSnapshotUpdatedAt: String(source.generatedAt || source.snapshotGeneratedAt || ''),
    rowCount: rows.length,
    requiresFullRebuild: false,
    recommendedAction: 'none',
    message: 'モニター表示用キャッシュを更新しました。'
  };
}

function rebuildMonitorSnapshotFromMonitor(authToken) {
  try {
    MonitorService.assertMonitorAccess(authToken);
    const result = AdminService.runLoggedOperation(
      'MONITOR_REBUILD_MONITOR_SNAPSHOT',
      () => AdminService.withAdminActionLock(
        'rebuildMonitorSnapshotFromMonitor',
        () => MonitorSnapshotService.writeDashboardSnapshot()
      ),
      summarizeMonitorSnapshotRebuildResult_
    );
    return formatMonitorSnapshotRebuildResponse_(result);
  } catch (error) {
    const message = AdminService.formatErrorMessage_(error);
    if (message === MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE) {
      return {
        ok: false,
        requiresFullRebuild: false,
        recommendedAction: 'retry',
        message: message || '別の処理が実行中です。少し待ってから再実行してください。'
      };
    }
    if (message !== MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE) {
      LoggerService.logDeveloperError('Webモニターからのモニター表示用キャッシュ更新 failed', error);
    }
    return {
      ok: false,
      requiresFullRebuild: true,
      recommendedAction: 'full-rebuild',
      message: 'モニターだけ更新では復旧できませんでした。集計から完全更新を実行してください。'
    };
  }
}

function rebuildAggregateAndMonitorCacheFromMonitor(authToken) {
  try {
    MonitorService.assertMonitorAccess(authToken);
    const result = AdminService.runLoggedOperation(
      'MONITOR_REBUILD_AGGREGATE_MONITOR_CACHE',
      () => AdminService.withAdminActionLock(
        'rebuildAggregateAndMonitorCacheFromMonitor',
        () => rebuildAggregateAndMonitorCacheCore_()
      ),
      summarizeAggregateMonitorCacheResult_
    );
    return formatMonitorRebuildCacheResponse_(result);
  } catch (error) {
    const message = AdminService.formatErrorMessage_(error);
    if (message !== MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE) {
      LoggerService.logDeveloperError('Webモニターからの集計・モニターキャッシュ更新 failed', error);
    }
    return {
      ok: false,
      message: message || '集計キャッシュとモニターキャッシュの更新に失敗しました。'
    };
  }
}

function rebuildAggregateAndMonitorCacheForTrigger_() {
  if (!isAutoRebuildCacheEnabled_()) {
    return AdminService.runLoggedOperation(
      'AUTO_REBUILD_AGGREGATE_MONITOR_CACHE_SKIPPED',
      () => ({
        skipped: true,
        reason: 'disabled',
        nextAction: 'AUTO_REBUILD_SKIPPED_DISABLED'
      }),
      summarizeAggregateMonitorCacheResult_
    );
  }
  return AdminService.runLoggedOperation(
    'AUTO_REBUILD_AGGREGATE_MONITOR_CACHE',
    () => AdminService.withAdminActionLock(
      'rebuildAggregateAndMonitorCacheForTrigger_',
      () => rebuildAggregateAndMonitorCacheCore_()
    ),
    summarizeAggregateMonitorCacheResult_
  );
}

function getAggregateMonitorAutoRefreshTriggers_() {
  if (typeof ScriptApp === 'undefined' || !ScriptApp.getProjectTriggers) {
    return [];
  }
  return ScriptApp.getProjectTriggers()
    .filter((trigger) => {
      try {
        return trigger
          && typeof trigger.getHandlerFunction === 'function'
          && [MOL_DRILL_AUTO_REBUILD_TRIGGER_HANDLER, 'rebuildAggregateAndMonitorCacheForTrigger'].includes(trigger.getHandlerFunction());
      } catch (_ignored) {
        return false;
      }
    });
}

function deleteAggregateMonitorAutoRefreshTriggers_() {
  const triggers = getAggregateMonitorAutoRefreshTriggers_();
  if (typeof ScriptApp === 'undefined' || !ScriptApp.deleteTrigger) {
    return 0;
  }
  triggers.forEach((trigger) => {
    ScriptApp.deleteTrigger(trigger);
  });
  return triggers.length;
}

function createAggregateMonitorAutoRefreshTrigger_(intervalMinutes) {
  if (typeof ScriptApp === 'undefined' || !ScriptApp.newTrigger) {
    throw new Error('Apps Script の時間トリガーを作成できません。Apps Script 環境で実行してください。');
  }
  const builder = ScriptApp.newTrigger(MOL_DRILL_AUTO_REBUILD_TRIGGER_HANDLER).timeBased();
  if (intervalMinutes === 60 && typeof builder.everyHours === 'function') {
    return builder.everyHours(1).create();
  }
  if (!builder || typeof builder.everyMinutes !== 'function') {
    throw new Error('Apps Script の分単位トリガーを作成できません。');
  }
  return builder.everyMinutes(intervalMinutes).create();
}

function readAutoRebuildCacheIntervalMinutes_() {
  try {
    return normalizeAutoRebuildCacheIntervalMinutes_(
      SheetRepository.getSettingValue(MOL_DRILL_AUTO_REBUILD_CACHE_INTERVAL_MINUTES_SETTING_KEY)
    );
  } catch (_ignored) {
    return 5;
  }
}

function writeAutoRebuildCacheSettings_(enabled, intervalMinutes) {
  const settings = [{
    key: MOL_DRILL_AUTO_REBUILD_CACHE_ENABLED_SETTING_KEY,
    value: String(enabled === true),
    description: MOL_DRILL_SETTING_DESCRIPTIONS.AUTO_REBUILD_CACHE_ENABLED
  }];
  if (intervalMinutes != null) {
    settings.push({
      key: MOL_DRILL_AUTO_REBUILD_CACHE_INTERVAL_MINUTES_SETTING_KEY,
      value: String(intervalMinutes),
      description: MOL_DRILL_SETTING_DESCRIPTIONS.AUTO_REBUILD_CACHE_INTERVAL_MINUTES
    });
  }
  SheetRepository.setSettingValues_(settings);
}

function installAggregateMonitorAutoRefreshTriggerFromMenu() {
  return runMenuOperation_(
    '集計・モニター自動更新を有効化',
    'MENU_INSTALL_AGGREGATE_MONITOR_AUTO_REFRESH',
    () => AdminService.withAdminActionLock('installAggregateMonitorAutoRefreshTriggerFromMenu', () => {
      SheetRepository.assertManagementSheetsReady();
      const intervalMinutes = readAutoRebuildCacheIntervalMinutes_();
      const deletedTriggers = deleteAggregateMonitorAutoRefreshTriggers_();
      createAggregateMonitorAutoRefreshTrigger_(intervalMinutes);
      writeAutoRebuildCacheSettings_(true, intervalMinutes);
      return {
        intervalMinutes,
        deletedTriggers,
        createdTriggers: 1,
        processed: 1,
        success: 1,
        nextAction: `AUTO_REBUILD_ON_${intervalMinutes}_MIN`
      };
    }),
    (result) => `集計・モニター自動更新をONにしました。\n${result.intervalMinutes || 5}分ごとに集計キャッシュ、問題タイプ別キャッシュ、モニターキャッシュを更新します。\n生徒画面の採点速度には影響しません。集計・モニター反映を別実行で更新します。`,
    { summarizeResult: () => ({ processedCount: 1, successCount: 1, errorCount: 0, skippedCount: 0, nextAction: 'AUTO_REBUILD_ON' }) }
  );
}

function uninstallAggregateMonitorAutoRefreshTriggerFromMenu() {
  return runMenuOperation_(
    '集計・モニター自動更新を停止',
    'MENU_UNINSTALL_AGGREGATE_MONITOR_AUTO_REFRESH',
    () => AdminService.withAdminActionLock('uninstallAggregateMonitorAutoRefreshTriggerFromMenu', () => {
      SheetRepository.assertManagementSheetsReady();
      const deletedTriggers = deleteAggregateMonitorAutoRefreshTriggers_();
      writeAutoRebuildCacheSettings_(false, null);
      return {
        deletedTriggers,
        processed: deletedTriggers,
        success: deletedTriggers,
        nextAction: 'AUTO_REBUILD_OFF'
      };
    }),
    (result) => `集計・モニター自動更新を停止しました。\n削除したトリガー: ${result.deletedTriggers || 0}件`,
    { summarizeResult: (result) => ({ processedCount: result.deletedTriggers || 0, successCount: result.deletedTriggers || 0, errorCount: 0, skippedCount: 0, nextAction: 'AUTO_REBUILD_OFF' }) }
  );
}

function buildAggregateMonitorAutoRefreshStatus_() {
  SheetRepository.assertManagementSheetsReady();
  const enabled = isAutoRebuildCacheEnabled_();
  const intervalMinutes = readAutoRebuildCacheIntervalMinutes_();
  const triggers = getAggregateMonitorAutoRefreshTriggers_();
  const monitorCacheRow = SheetRepository.readMonitorCacheRow(MOL_DRILL_MONITOR_DASHBOARD_CACHE_KEY);
  return {
    enabled,
    intervalMinutes,
    triggerCount: triggers.length,
    monitorSnapshotUpdatedAt: monitorCacheRow && monitorCacheRow.updatedAt ? monitorCacheRow.updatedAt : '',
    studentRuntime: 'fast'
  };
}

function showAggregateMonitorAutoRefreshStatusFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const status = buildAggregateMonitorAutoRefreshStatus_();
    ui.alert([
      '集計・モニター自動更新の状態',
      '',
      `AUTO_REBUILD_CACHE_ENABLED: ${status.enabled}`,
      `AUTO_REBUILD_CACHE_INTERVAL_MINUTES: ${status.intervalMinutes}`,
      `実際のトリガー数: ${status.triggerCount}`,
      `最後のモニターキャッシュ更新: ${status.monitorSnapshotUpdatedAt || '未更新'}`,
      `生徒API: 常時高速ルート (${status.studentRuntime})`,
      '',
      '採点直後のモニター反映は遅れることがあります。',
      '自動更新がONなら、指定間隔で集計・モニター反映を更新します。',
      'すぐ反映したい場合は ⑨ 集計キャッシュを更新 を使ってください。'
    ].join('\n'));
    return status;
  } catch (error) {
    const message = AdminService.formatErrorMessage_(error);
    LoggerService.logDeveloperError('集計・モニター自動更新の状態表示 failed', error);
    ui.alert(`集計・モニター自動更新の状態表示に失敗しました:\n${message}`);
    throw error;
  }
}

function rebuildProblemTypeStatsCache(authToken) {
  AdminService.assertAdminAccess(authToken);
  return AdminService.withAdminActionLock('rebuildProblemTypeStatsCache', () => AdminService.runLoggedOperation(
    'REBUILD_PROBLEM_TYPE_STATS_CACHE',
    () => AggregationService.rebuildProblemTypeStatsCache()
  ));
}

function rebuildProblemTypeStatsCacheFromMenu() {
  return runMenuOperation_(
    '問題タイプ別キャッシュを更新',
    'MENU_REBUILD_PROBLEM_TYPE_STATS_CACHE',
    () => AdminService.withAdminActionLock('rebuildProblemTypeStatsCacheFromMenu', () => AggregationService.rebuildProblemTypeStatsCache()),
    (result) => `問題タイプ別キャッシュを更新しました: ${result.updated || 0}行`
  );
}

function buildMonitorDashboardData_() {
  SheetRepository.assertManagementSheetsReady();
  const courses = SheetRepository.readCourseRows();
  const students = SheetRepository.readStudentRows()
    .filter((row) => !TokenService.isTeacherTestStudentRosterKey(row.rosterKey));
  const summaries = SheetRepository.readAggregateCache()
    .filter((row) => !TokenService.isTeacherTestStudentRosterKey(row.rosterKey));
  const tokens = SheetRepository.readTokenRows()
    .filter((row) => !TokenService.isTeacherTestStudentRosterKey(row.rosterKey));
  const distributionStatusRows = SheetRepository.readDistributionStatusRows()
    .filter((row) => !TokenService.isTeacherTestStudentRosterKey(row.rosterKey));
  const progressRows = AggregationService.buildAdminProgressRows(students, summaries, tokens, distributionStatusRows);
  const activeStudents = students.filter((row) => row.status !== '退籍').length;
  const activeTokens = tokens.filter((row) => row.token && !SheetRepository.isFlagEnabled_(row.revoked)).length;
  return {
    appName: MOL_DRILL_APP_NAME,
    appVersion: MOL_DRILL_APP_VERSION,
    generatedAt: new Date().toISOString(),
    courseOverview: {
      totalCount: courses.length,
      checkedCount: courses.filter((row) => row.checked).length
    },
    studentOverview: {
      totalCount: students.length,
      activeCount: activeStudents,
      retiredCount: students.length - activeStudents
    },
    tokenOverview: {
      totalCount: tokens.length,
      activeCount: activeTokens,
      revokedCount: tokens.filter((row) => SheetRepository.isFlagEnabled_(row.revoked)).length
    },
    dashboardMetrics: AggregationService.buildAdminDashboardMetrics(progressRows),
    progressRows
  };
}

function buildMonitorMaintenanceLinks_() {
  let spreadsheetUrl = '';
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    spreadsheetUrl = spreadsheet && typeof spreadsheet.getUrl === 'function'
      ? String(spreadsheet.getUrl() || '')
      : '';
  } catch (_ignored) {
    spreadsheetUrl = '';
  }
  return {
    spreadsheetUrl
  };
}

function attachMonitorMaintenanceLinks_(data) {
  return {
    ...(data || {}),
    maintenanceLinks: buildMonitorMaintenanceLinks_()
  };
}

function getMonitorDashboardData(authToken) {
  const startedAtMs = Date.now();
  const metrics = MonitorSnapshotService.createReadMetrics_();
  let response = null;
  try {
    MonitorService.assertMonitorAccess(authToken);
    const snapshot = MonitorSnapshotService.readDashboardSnapshot(metrics);
    response = attachMonitorMaintenanceLinks_(snapshot || buildMonitorDashboardSnapshotMissingResponse_());
    return response;
  } finally {
    const source = response && response.source ? response.source : 'error';
    const snapshotMode = response && response.snapshotMode ? response.snapshotMode : '';
    const rows = response && Array.isArray(response.progressRows) ? response.progressRows : [];
    const snapshotGeneratedAt = response && response.snapshotGeneratedAt
      ? response.snapshotGeneratedAt
      : (metrics.snapshotGeneratedAt || '');
    LoggerService.logDeveloperInfo(`getMonitorDashboardData elapsedMs=${Date.now() - startedAtMs} source=${source} snapshotMode=${snapshotMode} cacheReadElapsedMs=${metrics.cacheReadElapsedMs} sheetReadElapsedMs=${metrics.sheetReadElapsedMs} jsonParseElapsedMs=${metrics.jsonParseElapsedMs} rowCount=${rows.length} payloadBytes=${metrics.payloadBytes} snapshotGeneratedAt=${snapshotGeneratedAt} liveFallback=false`);
  }
}

function buildMonitorDashboardSnapshotMissingResponse_() {
  return {
    appName: MOL_DRILL_APP_NAME,
    appVersion: MOL_DRILL_APP_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'snapshot-missing',
    snapshotMode: 'snapshot-missing',
    snapshotMissing: true,
    snapshotGeneratedAt: '',
    courseOverview: { totalCount: 0, checkedCount: 0 },
    studentOverview: { totalCount: 0, activeCount: 0, retiredCount: 0 },
    tokenOverview: { totalCount: 0, activeCount: 0, revokedCount: 0 },
    dashboardMetrics: AggregationService.buildAdminDashboardMetrics([]),
    progressRows: [],
    message: 'モニターキャッシュが未作成です。\nまず強調表示されている「モニターだけ更新」を押してください。\nそれでも表示できない場合や、人数・集計が古い場合は「集計から完全更新」を実行してください。\n必要に応じて管理スプレッドシートを開いて確認してください。'
  };
}

// Read-only, bounded review pages. Cursor is a physical log row; new answers do not
// shift pages already being reviewed. Never return tokens or raw client metadata.
function getMonitorStudentAnswerReview(authToken, rosterKey, options) {
  MonitorService.assertMonitorAccess(authToken);
  const key = String(rosterKey || '').trim();
  if (!key || TokenService.isTeacherTestStudentRosterKey(key)) return { rows: [], nextBeforeRow: null };
  return readMonitorStudentAnswerReview_(SheetRepository.getManagedSheetWithoutSchemaCheck_('解答ログ'), key, options);
}

function readMonitorStudentAnswerReview_(sheet, key, options) {
  const opts = options || {};
  const result = String(opts.result || 'all');
  const level = String(opts.level || 'all');
  if (!['all', 'correct', 'incorrect'].includes(result) || !['all', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6'].includes(level)) {
    throw new Error('レビューの絞り込み条件が不正です。');
  }
  const headers = SheetRepository.getHeaderColumnMap_(sheet);
  if (!headers.rosterKey || !headers.isCorrect || !headers.level) throw new Error('解答ログの列を確認してください。');
  const lastRow = sheet.getLastRow();
  let end = lastRow;
  if (opts.beforeRow != null) {
    const cursor = Number(opts.beforeRow);
    if (!Number.isSafeInteger(cursor) || cursor < 2) throw new Error('レビューの続き位置が不正です。');
    end = Math.min(lastRow, cursor - 1);
  }
  if (end < 2) return { rows: [], nextBeforeRow: null };
  const start = Math.max(2, end - 499);
  const values = sheet.getRange(start, 1, end - start + 1, sheet.getLastColumn()).getValues();
  const rows = [];
  let next = start;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    next = start + i;
    if (String(values[i][headers.rosterKey - 1] || '').trim() !== key) continue;
    const row = SheetRepository.answerLogObjectToRow_(SheetRepository.rowValuesToObject_(headers, values[i]));
    if (level !== 'all' && row.level !== level) continue;
    if (result === 'correct' && !row.isCorrect || result === 'incorrect' && row.isCorrect) continue;
    const acceptance = AnswerService.extractAnswerAcceptanceFromClientInfo_(row.clientInfo);
    rows.push({
      timestamp: row.timestamp, attemptId: row.attemptId, level: row.level,
      problemType: row.problemType, questionText: row.questionText,
      submittedAnswer: row.submittedAnswer, expectedAnswer: row.expectedAnswer,
      expectedAnswerText: row.expectedAnswer === '' ? '' : AnswerService.formatAnswerText_(row.expectedAnswer, row.unit, row.significantDigits, row.level),
      unit: row.unit, isCorrect: row.isCorrect, explanation: row.explanation,
      elapsedMs: row.elapsedMs, significantDigits: row.significantDigits,
      acceptedAnswerType: ['exact', 'rounded', 'precision'].includes(acceptance.acceptedAnswerType) ? acceptance.acceptedAnswerType : ''
    });
    if (rows.length >= 20) break;
  }
  return { rows: rows, nextBeforeRow: next > 2 ? next : null };
}

// Only the explicitly configured test project can create or read this isolated
// fixture sheet. No tokens, roster rows or real answer-log rows are created.
class ReviewBenchmarkService {
  static assertTestProject_() {
    if (ScriptApp.getScriptId() !== '1opnwxGruF4ZYiVvQxADm2-oJcE_ZCLBkPlysFBAx-CTi2GQKN-wMgCnp') {
      throw new Error('測定ページは指定のGAS検証プロジェクトでのみ利用できます。');
    }
  }
  static sheetName_() { return '検証_詳細レビュー_v1'; }
  static headers_() { return MOL_DRILL_SHEETS.find(def => def.name === '解答ログ').headers; }
  static sheet_() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(this.sheetName_());
    if (!sheet || sheet.getLastRow() !== 1201) throw new Error('先に「測定データを準備」を実行してください。');
    const header = sheet.getRange(1, 1, 1, this.headers_().length).getValues()[0];
    if (JSON.stringify(header) !== JSON.stringify(this.headers_())) throw new Error('測定シートの列が一致しません。');
    return sheet;
  }
  static fixture_() {
    return Array.from({length: 1200}, (_, i) => {
      const attempt = Math.floor(i / 10), level = 'lv' + (attempt % 6 + 1);
      const correct = attempt % 4 < 2, precision = !correct && ['lv5', 'lv6'].includes(level);
      return { timestamp: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(), attemptId: 'benchmark-v1-' + i,
        rosterKey: 'benchmark::s' + (i % 10), level: level, problemType: 'mass_to_mol',
        questionText: '水のモル質量は18.0 g/molです。水36.0 gの物質量を求めなさい。' + (['lv5', 'lv6'].includes(level) ? '有効数字3桁で答えなさい。' : ''),
        expectedAnswer: '2', submittedAnswer: correct ? '2.00' : precision ? '2.0' : '3',
        unit: 'mol', isCorrect: correct, significantDigits: '3', elapsedMs: 12000,
        explanation: '物質量 = 質量 ÷ モル質量。36.0 ÷ 18.0 = 2.00 mol。',
        clientInfo: JSON.stringify({acceptedAnswerType: correct ? 'exact' : precision ? 'precision' : ''}) };
    });
  }
}

function prepareMonitorReviewBenchmark(authToken) {
  MonitorService.assertMonitorAccess(authToken);
  ReviewBenchmarkService.assertTestProject_();
  return AdminService.withAdminActionLock('prepareMonitorReviewBenchmark', () => {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet.getSheetByName(ReviewBenchmarkService.sheetName_())) {
      const sheet = spreadsheet.insertSheet(ReviewBenchmarkService.sheetName_());
      const headers = ReviewBenchmarkService.headers_();
      const values = [headers].concat(ReviewBenchmarkService.fixture_().map(row => headers.map(key => row[key] == null ? '' : row[key])));
      if (sheet.getMaxRows() < values.length) sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
      if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
      sheet.getRange(1, 1, values.length, headers.length).setValues(values);
    }
    ReviewBenchmarkService.sheet_(); // Never overwrite an existing, unexpected sheet.
    return {ok: true, students: 10, answers: 1200, fixtureVersion: 1};
  });
}

function getReviewBenchmarkDashboard(authToken) {
  MonitorService.assertMonitorAccess(authToken);
  ReviewBenchmarkService.assertTestProject_();
  ReviewBenchmarkService.sheet_();
  const rows = Array.from({length: 10}, (_, i) => ({rosterKey:'benchmark::s' + i, name:'測定生徒' + (i + 1), number:i + 1, courseName:'測定専用', totalAttempts:120, totalCorrect:60, totalAccuracy:0.5}));
  return {ok:true, complete:true, processed:1200, total:1200, data:{appVersion:MOL_DRILL_APP_VERSION,
    answersThrough:new Date().toISOString(), maintenanceLinks:buildMonitorMaintenanceLinks_(), progressRows:rows, dashboardMetrics:AggregationService.buildAdminDashboardMetrics(rows)}};
}

function getReviewBenchmarkPage(authToken, rosterKey, options) {
  MonitorService.assertMonitorAccess(authToken);
  ReviewBenchmarkService.assertTestProject_();
  if (!/^benchmark::s[0-9]$/.test(String(rosterKey))) throw new Error('測定用の生徒を指定してください。');
  return readMonitorStudentAnswerReview_(ReviewBenchmarkService.sheet_(), String(rosterKey), options);
}

function getReviewBenchmarkStats(authToken, rosterKey) {
  MonitorService.assertMonitorAccess(authToken);
  ReviewBenchmarkService.assertTestProject_();
  if (!/^benchmark::s[0-9]$/.test(String(rosterKey))) throw new Error('測定用の生徒を指定してください。');
  const sheet = ReviewBenchmarkService.sheet_(), headers = SheetRepository.getHeaderColumnMap_(sheet);
  const rows = sheet.getRange(2, 1, 1200, sheet.getLastColumn()).getValues()
    .map(row => SheetRepository.answerLogObjectToRow_(SheetRepository.rowValuesToObject_(headers, row)))
    .filter(row => row.rosterKey === rosterKey);
  return AggregationService.buildProblemTypeStatsRows(rows, new Date().toISOString());
}

function getMonitorStudentAnswerHistory(authToken, rosterKey, limit) {
  MonitorService.assertMonitorAccess(authToken);
  SheetRepository.assertManagementSheetsReady();
  const normalizedRosterKey = String(rosterKey || '').trim();
  const defaultLimit = 20;
  const rawLimit = limit == null || limit === '' ? defaultLimit : Number(limit);
  const normalizedLimit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(0, Math.floor(rawLimit)))
    : defaultLimit;
  if (normalizedRosterKey === '' || normalizedLimit <= 0) {
    return [];
  }
  return SheetRepository.readLatestAnswerLogsForRosterKey(normalizedRosterKey, normalizedLimit)
    .reverse()
    .map((row) => ({
      timestamp: row.timestamp,
      attemptId: row.attemptId,
      courseName: row.courseName,
      number: row.number,
      name: row.name,
      level: row.level,
      problemType: row.problemType,
      questionText: row.questionText,
      questionHtml: row.questionHtml,
      expectedAnswer: row.expectedAnswer,
      submittedAnswer: row.submittedAnswer,
      normalizedSubmittedAnswer: row.normalizedSubmittedAnswer,
      unit: row.unit,
      isCorrect: row.isCorrect,
      elapsedMs: row.elapsedMs,
      explanation: row.explanation,
      rosterKey: row.rosterKey
    }));
}

function getMonitorStudentProblemTypeStats(authToken, rosterKey) {
  MonitorService.assertMonitorAccess(authToken);
  SheetRepository.assertManagementSheetsReady();
  const normalizedRosterKey = String(rosterKey || '').trim();
  if (normalizedRosterKey === '') {
    return [];
  }
  return SheetRepository.readProblemTypeStatsForRosterKey(normalizedRosterKey)
    .map((row) => ({
      updatedAt: row.updatedAt,
      courseName: row.courseName,
      rosterKey: row.rosterKey,
      number: row.number,
      name: row.name,
      level: row.level,
      problemType: row.problemType,
      attempts: row.attempts,
      correct: row.correct,
      accuracy: row.accuracy,
      recentAttempts: row.recentAttempts,
      recentCorrect: row.recentCorrect,
      recentAccuracy: row.recentAccuracy,
      averageElapsedMs: row.averageElapsedMs,
      recentAverageElapsedMs: row.recentAverageElapsedMs,
      lastAnsweredAt: row.lastAnsweredAt,
      lastIsCorrect: row.lastIsCorrect,
      lastElapsedMs: row.lastElapsedMs
    }));
}

function getStudentState(token) {
  return AnswerService.getStudentState(token);
}

function initializeStudentSession(token, options) {
  return AnswerService.initializeStudentSession(token, options || {});
}

function getPracticeProblem(token, options) {
  return AnswerService.getPracticeProblem(token, options || {});
}

function submitAnswer(request) {
  return AnswerService.submitAnswer(request || {});
}

function initializeTeacherPreviewSession(authToken, options) {
  return AnswerService.initializeTeacherPreviewSession(authToken, options || {});
}

function getTeacherPreviewProblem(authToken, options) {
  return AnswerService.getTeacherPreviewProblem(authToken, options || {});
}

function submitTeacherPreviewAnswer(authToken, request) {
  return AnswerService.submitTeacherPreviewAnswer(authToken, request || {});
}

function buildTeacherStudentPreviewUrl(authToken, token) {
  return AdminService.buildTeacherStudentPreviewUrl(authToken, token);
}

function generateProblem(level) {
  return MolProblemService.generateProblem(level);
}

function generateBeginnerProblem() {
  return MolProblemService.generateBeginnerProblem({});
}

function generateIntermediateProblem() {
  return MolProblemService.generateIntermediateProblem({});
}

function generateAdvancedProblem() {
  return MolProblemService.generateAdvancedProblem({});
}

function normalizeNumericInput(input) {
  return MolProblemService.normalizeNumericInput(input);
}

function roundToSignificantDigits(value, digits) {
  return MolProblemService.roundToSignificantDigits(value, digits);
}

function isAnswerCorrect(submitted, expected, tolerance, significantDigits, level) {
  return MolProblemService.isAnswerCorrect(submitted, expected, tolerance, significantDigits, level);
}

function buildExplanation(problem) {
  return MolProblemService.buildExplanation(problem || {});
}

function generateSampleProblemsForTest() {
  return MolProblemService.generateSampleProblemsForTest();
}

function validateProblemGenerationSamplesForTest(count) {
  return MolProblemService.validateProblemGenerationSamplesForTest(count);
}

function getStudentLearningCheck(token, options) {
  return AnswerService.getStudentLearningCheck(token, options);
}


// Real student submission path, restricted to disposable identities in the test
// project. No Classroom roster or distribution records are created.
class StudentLoadBenchmarkService {
  static cache_() { return CacheService.getScriptCache(); }
  static key_(runId) { return 'studentLoad:'+runId; }
  static run_(runId) {
    if(!/^[A-Za-z0-9-]{1,80}$/.test(String(runId))) throw new Error('測定IDが不正です。');
    const run=JSON.parse(this.cache_().get(this.key_(runId)) || 'null');
    if(!run) throw new Error('測定データの期限が切れています。再準備してください。');
    return run;
  }
  static prepare_(options) {
    const count=Number(options && options.count || 40);
    if(![2,5,20,40,80].includes(count)) throw new Error('測定人数は2・5・20・40・80人から選んでください。');
    const runId=Utilities.getUuid();const issuedAt=new Date().toISOString();
    const tokens=Array.from({length:count},(_,index)=>({token:TokenService.generateToken(),courseId:'__TEST_LOAD__',courseName:'採点測定専用',
      rosterKey:'__TEST_LOAD__::'+runId+':'+index,studentId:runId+':'+index,number:String(index+1),name:'測定専用'+(index+1),
      issuedAt,revoked:false,note:'自動測定用。Classroomには配付しない。2時間で期限切れ。'}));
    const sheet=SheetRepository.getStudentRuntimeSheet_('トークン管理');
    const headers=SheetRepository.getHeaderColumnMap_(sheet);const width=sheet.getLastColumn();
    let tokenStart;
    SheetRepository.withDocumentLock(()=>{
      tokenStart=sheet.getLastRow()+1;
      SheetRepository.appendRows_(sheet,tokens.map(row=>{
        const output=new Array(width).fill('');const fields={...row,'氏名':row.name,'出席番号':row.number};
        Object.keys(fields).forEach(key=>{if(headers[key])output[headers[key]-1]=fields[key];});return output;
      }));
    });
    const run={runId,count,tokens,tokenStart,answerStart:SheetRepository.getStudentRuntimeSheet_('解答ログ').getLastRow()+1,attempts:[]};
    this.cache_().put(this.key_(runId),JSON.stringify(run),21600);
    for(let index=0;index<count;index++) {
      const level='lv'+(index%6+1);
      const session=AnswerService.initializeStudentSession(tokens[index].token,{level,practiceMode:'manual'});
      const problem=MolProblemService.getStoredProblemForToken(tokens[index].token,session.problem.attemptId);
      const correct=index%5!==0;
      const submittedAnswer=correct ? (index%6>=4?Number(problem.expectedAnswer).toExponential(2):String(problem.expectedAnswer)) : String(Number(problem.expectedAnswer)*1.1);
      const slot={token:tokens[index].token,problem:session.problem,submittedAnswer,correct};
      this.cache_().put(this.key_(runId)+':'+index,JSON.stringify(slot),21600);
      run.attempts.push({attemptId:problem.attemptId,rosterKey:tokens[index].rosterKey,correct});
    }
    this.cache_().put(this.key_(runId),JSON.stringify(run),21600);
    return {runId,count};
  }
  static submit_(runId,index) {
    const run=this.run_(runId);const slotIndex=Number(index);
    if(!Number.isSafeInteger(slotIndex) || slotIndex<0 || slotIndex>=run.count) throw new Error('測定番号が不正です。');
    const slot=JSON.parse(this.cache_().get(this.key_(runId)+':'+slotIndex) || 'null');
    if(!slot) throw new Error('測定問題の期限が切れています。');
    const response=AnswerService.submitAnswer({token:slot.token,problem:slot.problem,submittedAnswer:slot.submittedAnswer,elapsedMs:15000,
      clientInfo:{benchmarkRunId:runId},skipNextProblem:true});
    return {isCorrect:response.result.isCorrect,expectedCorrect:slot.correct,duplicate:response.duplicate,performance:response.performance};
  }
  static finish_(runId) {
    const run=this.run_(runId);const sheet=SheetRepository.getStudentRuntimeSheet_('解答ログ');
    const headers=SheetRepository.getHeaderColumnMap_(sheet);const last=sheet.getLastRow();const width=sheet.getLastColumn();
    const expected=new Map(run.attempts.map(row=>[row.attemptId,row]));const counts={};let recorded=0,gradingErrors=0;
    for(let start=run.answerStart;start<=last;start+=500) {
      const values=sheet.getRange(start,1,Math.min(500,last-start+1),width).getValues();
      for(const valuesRow of values) {
        const row=SheetRepository.answerLogObjectToRow_(SheetRepository.rowValuesToObject_(headers,valuesRow));
        const target=expected.get(row.attemptId);if(!target || row.rosterKey!==target.rosterKey)continue;
        recorded++;counts[row.attemptId]=(counts[row.attemptId] || 0)+1;
        if(row.isCorrect!==target.correct)gradingErrors++;
      }
    }
    const tokenSheet=SheetRepository.getStudentRuntimeSheet_('トークン管理');const tokenHeaders=SheetRepository.getHeaderColumnMap_(tokenSheet);
    SheetRepository.withDocumentLock(()=>{
      const rows=tokenSheet.getRange(run.tokenStart,1,run.count,tokenSheet.getLastColumn()).getValues();
      if(rows.some((row,index)=>row[tokenHeaders.token-1]!==run.tokens[index].token || row[tokenHeaders.rosterKey-1]!==run.tokens[index].rosterKey)) throw new Error('測定用トークンの行位置が変更されています。');
      tokenSheet.getRange(run.tokenStart,tokenHeaders.revoked,run.count,1).setValues(run.tokens.map(()=>[true]));
      run.tokens.forEach(row=>TokenService.clearTokenRowCache_(row.token));
    });
    return {recorded,uniqueAttempts:Object.keys(counts).length,duplicates:recorded-Object.keys(counts).length,gradingErrors,expected:run.count,closed:true};
  }
}
function prepareStudentLoadBenchmark(authToken,options) {
  MonitorService.assertMonitorAccess(authToken);ReviewBenchmarkService.assertTestProject_();
  return StudentLoadBenchmarkService.prepare_(options);
}
function submitStudentLoadBenchmark(authToken,runId,index) {
  MonitorService.assertMonitorAccess(authToken);ReviewBenchmarkService.assertTestProject_();
  return StudentLoadBenchmarkService.submit_(runId,index);
}
function finishStudentLoadBenchmark(authToken,runId) {
  MonitorService.assertMonitorAccess(authToken);ReviewBenchmarkService.assertTestProject_();
  return StudentLoadBenchmarkService.finish_(runId);
}


// On-demand navigation only. No credentials, settings values or answer rows leave this API.
function getMonitorOperationLinks(authToken, rosterKey) {
  MonitorService.assertMonitorAccess(authToken);
  if (rosterKey != null && (typeof rosterKey !== 'string' || rosterKey.length > 300)) throw new Error('対象の生徒を確認してください。');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const baseUrl = String(spreadsheet.getUrl() || '').split('#')[0];
  const names = {classrooms:'Classroom一覧', roster:'生徒名簿', tokens:'トークン管理', distribution:'配付ログ', settings:'設定', execution:'実行ログ'};
  const sheets = {}, found = {};
  Object.keys(names).forEach(key => {
    const sheet = spreadsheet.getSheetByName(names[key]);
    found[key] = sheet;
    sheets[key] = sheet ? baseUrl + '#gid=' + sheet.getSheetId() : '';
  });
  const studentRows = {tokens:'',roster:''};
  if (rosterKey) for (const key of Object.keys(studentRows)) {
    if (!found[key]) continue;
    const row = SheetRepository.findRowIndexByHeaderValueInSheet_(found[key], 'rosterKey', rosterKey, {matchCase:true});
    if (row) studentRows[key] = sheets[key] + '&range=A' + row;
  }
  return {sheets, studentRows};
}
