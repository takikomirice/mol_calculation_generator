// もるくえ！ - Google Apps Script / V8 / HTMLService

const MOL_DRILL_APP_NAME = 'もるくえ！';
const MOL_DRILL_ADMIN_APP_NAME = 'もるくえ！ 管理ダッシュボード';
const MOL_DRILL_FORMAL_DESCRIPTION = 'Classroom連携型モル計算練習アプリ';
const MOL_DRILL_APP_VERSION = '1.0.0';
const MOL_DRILL_EXPECTED_SCHEMA_VERSION = '17';
const MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE = 40;
const MOL_DRILL_ADMIN_LOG_LIMIT = 50;
const MOL_DRILL_ADMIN_TOKEN_SETTING_KEY = 'ADMIN_TOKEN';
const MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY = 'MOL_DRILL_ADMIN_TOKEN';
const MOL_DRILL_DEFAULT_POST_TEXT_TEMPLATE = 'もるくえ！(モル計算ドリル)の入場URLです。\n\n{{氏名}} さん専用URL:\n{{studentUrl}}\n\nこのURLは本人専用です。他の人に共有しないでください。\n※「10の23乗」は「10^23」と入力してください。';
const MOL_DRILL_ADMIN_ACTION_LOCK_WAIT_MS = 1000;
const MOL_DRILL_ADMIN_ACTION_LOCK_ERROR_MESSAGE = '別の処理が実行中です。少し待ってから再実行してください。';
const MOL_DRILL_TEACHER_PREVIEW_NONCE_TTL_SECONDS = 60 * 10;
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

const MOL_DRILL_SHEETS = [
  {
    name: '設定',
    headers: ['キー', '値', '説明', '更新日時'],
    description: 'WebアプリURL、スキーマ、動作設定を保持します。',
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
    headers: ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
    description: '生徒用WebアプリURLの個別トークンを管理します。',
    checkboxHeaders: ['revoked'],
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
    ],
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
  { key: 'schemaVersion', value: MOL_DRILL_EXPECTED_SCHEMA_VERSION, description: '管理シート構造のスキーマバージョン' },
  { key: 'WEB_APP_URL', value: '', description: '生徒用WebアプリURL。生徒URLは WEB_APP_URL + ?t=TOKEN で作成します。' },
  { key: MOL_DRILL_ADMIN_TOKEN_SETTING_KEY, value: '', description: '管理ダッシュボード内部認証用トークン。通常は自動管理します。' },
  { key: 'POST_TEXT_TEMPLATE', value: MOL_DRILL_DEFAULT_POST_TEXT_TEMPLATE, description: 'Classroom個別お知らせ本文テンプレート' },
  { key: 'CLASSROOM_SEND_BATCH_SIZE', value: String(MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE), description: 'Classroom URL配付の1回あたり最大件数' },
  { key: 'DRY_RUN', value: 'false', description: 'true の場合、Classroom投稿を作成せず配付ログだけ記録します。' },
  { key: 'ENABLE_DISTRIBUTION_LOG', value: 'true', description: 'true の場合、配付結果を配付ログへ記録します。' },
  { key: 'ENABLE_ADAPTIVE_PROBLEM_SELECTION', value: 'true', description: 'true の場合、生徒ごとの問題タイプ別キャッシュを使って出題タイプを調整します。' },
  { key: 'BEGINNER_AVOGADRO_CONSTANT', value: '6.0e23', description: '初級レベルの問題生成と採点に使うアボガドロ定数' },
  { key: 'INTERMEDIATE_AVOGADRO_CONSTANT', value: '6.0e23', description: '中級レベルの問題生成と採点に使うアボガドロ定数' },
  { key: 'ADVANCED_AVOGADRO_CONSTANT', value: '6.02e23', description: '上級レベルの問題生成と採点に使うアボガドロ定数' },
  { key: 'BEGINNER_TOLERANCE', value: '0.01', description: '初級レベルの数値解答に使う相対許容誤差' },
  { key: 'INTERMEDIATE_TOLERANCE', value: '0.02', description: '中級レベルの数値解答に使う相対許容誤差' },
  { key: 'ADVANCED_TOLERANCE', value: '0.005', description: '上級レベルの数値解答に使う相対許容誤差' }
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
      throw new Error('管理ダッシュボードの内部認証を初期化できていません。Spreadsheetのメニューから管理ダッシュボードを開き直してください。');
    }
    if (String(authToken || '').trim() !== configured) {
      throw new Error('管理ダッシュボードの内部認証が一致しません。Spreadsheetのメニューから管理ダッシュボードを開き直してください。');
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

  static getAdminSettings(authToken) {
    this.assertAdminAccess(authToken);
    return this.readAdminSettings_();
  }

  static saveAdminSettings(authToken, payload) {
    this.assertAdminAccess(authToken);
    const settings = this.normalizeSettingsPayload(payload);
    const rows = [
      { key: 'WEB_APP_URL', value: settings.webAppUrl, description: '生徒用WebアプリURL。生徒URLは WEB_APP_URL + ?t=TOKEN で作成します。' },
      { key: 'POST_TEXT_TEMPLATE', value: settings.postTextTemplate, description: 'Classroom個別お知らせ本文テンプレート' },
      { key: 'CLASSROOM_SEND_BATCH_SIZE', value: String(settings.batchSize), description: 'Classroom URL配付の1回あたり最大件数' },
      { key: 'DRY_RUN', value: String(settings.dryRun), description: 'true の場合、Classroom投稿を作成せず配付ログだけ記録します。' },
      { key: 'ENABLE_DISTRIBUTION_LOG', value: String(settings.enableDistributionLog), description: 'true の場合、配付結果を配付ログへ記録します。' },
      { key: 'ENABLE_ADAPTIVE_PROBLEM_SELECTION', value: String(settings.adaptiveProblemSelection), description: 'true の場合、生徒ごとの問題タイプ別キャッシュを使って出題タイプを調整します。' },
      { key: 'BEGINNER_AVOGADRO_CONSTANT', value: String(settings.beginnerAvogadroConstant), description: '初級レベルの問題生成と採点に使うアボガドロ定数' },
      { key: 'INTERMEDIATE_AVOGADRO_CONSTANT', value: String(settings.intermediateAvogadroConstant), description: '中級レベルの問題生成と採点に使うアボガドロ定数' },
      { key: 'ADVANCED_AVOGADRO_CONSTANT', value: String(settings.advancedAvogadroConstant), description: '上級レベルの問題生成と採点に使うアボガドロ定数' },
      { key: 'BEGINNER_TOLERANCE', value: String(settings.beginnerTolerance), description: '初級レベルの数値解答に使う相対許容誤差' },
      { key: 'INTERMEDIATE_TOLERANCE', value: String(settings.intermediateTolerance), description: '中級レベルの数値解答に使う相対許容誤差' },
      { key: 'ADVANCED_TOLERANCE', value: String(settings.advancedTolerance), description: '上級レベルの数値解答に使う相対許容誤差' }
    ];
    SheetRepository.setSettingValues_(rows);
    let nextAuthToken = String(authToken || '').trim();
    if (settings.adminToken !== '') {
      nextAuthToken = this.setAdminToken(settings.adminToken);
    }
    return {
      settings: this.readAdminSettings_(),
      authToken: nextAuthToken
    };
  }

  static saveCourseSyncSelection(authToken, selectedCourseIds) {
    this.assertAdminAccess(authToken);
    return this.withAdminActionLock('saveCourseSyncSelection', () => SheetRepository.setCourseSyncSelection(selectedCourseIds || []));
  }

  static getSheetLinks() {
    try {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const baseUrl = spreadsheet.getUrl();
      const links = {};
      for (const definition of MOL_DRILL_SHEETS) {
        const sheet = spreadsheet.getSheetByName(definition.name);
        if (sheet) {
          links[definition.name] = `${baseUrl}#gid=${sheet.getSheetId()}`;
        }
      }
      return links;
    } catch (_ignored) {
      return {};
    }
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
    const numeric = Number(value);
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

  static getExpectedSchemaVersion() {
    return MOL_DRILL_EXPECTED_SCHEMA_VERSION;
  }

  static getDefaultSettingsForTest() {
    return MOL_DRILL_DEFAULT_SETTINGS.map((setting) => ({ ...setting }));
  }

  static resetExecutionCaches_() {
    this.managedSheetCache_ = {};
    this.headerColumnMapCache_ = {};
    this.managementSchemaStatusCache_ = null;
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
    this.assertNoLegacySchemaBeforeSetup_();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = this.ensureSheet_(spreadsheet, definition);
      this.initializeSheet_(sheet, definition);
    }
    this.setSettingValue('schemaVersion', MOL_DRILL_EXPECTED_SCHEMA_VERSION, '管理シート構造のスキーマバージョン');
    AdminService.getOrCreateAdminToken();
    this.resetExecutionCaches_();
    return {
      ok: true,
      schemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
      message: 'もるくえ！の管理シートを作成・補修しました。'
    };
  }

  static reinitializeSheets() {
    this.resetExecutionCaches_();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = this.ensureSheet_(spreadsheet, definition);
      this.clearSheetForReinitialization_(sheet);
      this.initializeSheet_(sheet, definition);
    }
    this.setSettingValue('schemaVersion', MOL_DRILL_EXPECTED_SCHEMA_VERSION, '管理シート構造のスキーマバージョン');
    AdminService.getOrCreateAdminToken();
    this.resetExecutionCaches_();
    return {
      ok: true,
      schemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
      message: '管理シートを全初期化しました。'
    };
  }

  static getSchemaStatus() {
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
    const schemaVersion = this.getSettingValue_('schemaVersion');
    const versionOk = schemaVersion === MOL_DRILL_EXPECTED_SCHEMA_VERSION;
    return {
      ok: missingSheets.length === 0 && missingHeadersBySheet.length === 0 && unexpectedHeadersBySheet.length === 0 && versionOk,
      expectedSchemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
      schemaVersion,
      missingSheets,
      missingHeadersBySheet,
      unexpectedHeadersBySheet
    };
  }

  static assertManagementSchemaReady() {
    if (!this.managementSchemaStatusCache_) {
      this.managementSchemaStatusCache_ = this.getSchemaStatus();
    }
    const status = this.managementSchemaStatusCache_;
    if (!status.ok) {
      throw new Error(this.formatSchemaStatusMessage_(status));
    }
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
        revoked: row[headerMap.revoked - 1] === true || this.toString_(row[headerMap.revoked - 1]).toLowerCase() === 'true',
        note: this.toString_(row[headerMap.note - 1])
      }))
      .filter((row) => row.token !== '' || row.rosterKey !== '');
  }

  static tokenObjectToRow_(row) {
    const source = row || {};
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
      revoked: source.revoked === true || this.toString_(source.revoked).toLowerCase() === 'true',
      note: this.toString_(source.note)
    };
  }

  static writeTokenRows(rows) {
    const sheet = this.getManagedSheet_('トークン管理');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const values = rows.map((row) => [
      row.token,
      row.courseId,
      row.courseName,
      row.rosterKey,
      row.studentId,
      row.number,
      row.name,
      row.email,
      row.studentUrl,
      row.issuedAt,
      row.lastAccessedAt || '',
      row.revoked === true,
      row.note || ''
    ]);
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
    const rowIndex = this.findRowIndexByHeaderValue_('トークン管理', 'token', normalizedToken, { matchCase: true });
    if (!rowIndex) {
      return null;
    }
    return this.tokenObjectToRow_(this.readObjectAtRow_('トークン管理', rowIndex) || {});
  }

  static appendAnswerLog(entry) {
    const sheet = this.getManagedSheet_('解答ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const row = this.createBlankRow_(sheet);
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
    this.appendRows_(sheet, [row]);
  }

  static findAnswerLogByAttemptId(rosterKey, attemptId) {
    const normalizedRosterKey = this.toString_(rosterKey);
    const normalizedAttemptId = this.toString_(attemptId);
    if (normalizedRosterKey === '' || normalizedAttemptId === '') {
      return null;
    }
    const rows = this.findObjectsByHeaderValue_('解答ログ', 'attemptId', normalizedAttemptId, { matchCase: true });
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
    return this.findObjectsByHeaderValue_('解答ログ', 'rosterKey', normalizedRosterKey, { matchCase: true })
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
    ]);
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
    if (typeof LockService === 'undefined' || !LockService.getDocumentLock) {
      return callback();
    }
    const lock = LockService.getDocumentLock();
    try {
      lock.waitLock(10000);
      return callback();
    } finally {
      try {
        lock.releaseLock();
      } catch (_ignored) {
        // Ignore release failures to preserve the original operation result.
      }
    }
  }

  static getSettingValue(key) {
    return this.getSettingValue_(key);
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
    const existing = new Set(rows.map((row) => this.toString_(row[headerMap['キー'] - 1])));
    const now = this.nowIso_();
    const additions = MOL_DRILL_DEFAULT_SETTINGS
      .filter((setting) => !existing.has(setting.key))
      .map((setting) => [setting.key, setting.value || '', setting.description || '', now]);
    if (additions.length > 0) {
      rows.push(...additions);
    }
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('設定').headers, rows);
  }

  static assertNoLegacySchemaBeforeSetup_() {
    const schemaVersion = this.getSettingValue_('schemaVersion');
    if (schemaVersion !== '' && schemaVersion !== MOL_DRILL_EXPECTED_SCHEMA_VERSION) {
      throw new Error(`管理シートのスキーマが古いです。schemaVersion=${schemaVersion}、期待値=${MOL_DRILL_EXPECTED_SCHEMA_VERSION}。既存データを保持するため自動更新は行いません。必要なデータを確認したうえで「管理シート全初期化」を実行してください。`);
    }
  }

  static getManagedSheet_(name) {
    this.assertManagementSchemaReady();
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
    if (!sheet || sheet.getLastColumn() < 1 || sheet.getLastRow() < 1) {
      return {};
    }
    const cacheKey = this.getSheetCacheKey_(sheet);
    const cache = this.getHeaderColumnMapCache_();
    if (cacheKey && cache[cacheKey]) {
      return cache[cacheKey];
    }
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
    const rows = [];
    const seenRows = {};
    const maxMatches = lastRow - 1;
    for (let count = 0; count < maxMatches; count += 1) {
      const found = finder.findNext();
      if (!found || !found.getRow) {
        break;
      }
      const rowIndex = found.getRow();
      if (seenRows[rowIndex]) {
        break;
      }
      seenRows[rowIndex] = true;
      const row = this.readObjectAtRow_(sheetName, rowIndex);
      if (row) {
        rows.push(row);
      }
    }
    return rows;
  }

  static readObjectAtRow_(sheetName, rowIndex) {
    const sheet = this.getManagedSheet_(sheetName);
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

  static formatSchemaStatusMessage_(status) {
    const parts = [];
    if (status.schemaVersion !== status.expectedSchemaVersion) {
      parts.push(`schemaVersion=${status.schemaVersion || '(空)'} は期待値 ${status.expectedSchemaVersion} と一致しません。`);
    }
    if (status.missingSheets.length > 0) {
      parts.push(`不足シート: ${status.missingSheets.join(', ')}`);
    }
    for (const item of status.missingHeadersBySheet) {
      parts.push(`${item.sheetName} シートに必要なヘッダーがありません: ${item.headers.join(', ')}`);
    }
    for (const item of status.unexpectedHeadersBySheet || []) {
      parts.push(`${item.sheetName} シートに現行スキーマでは使わないヘッダーがあります: ${item.headers.join(', ')}`);
    }
    return parts.join('\n') || '管理シートのスキーマが不正です。';
  }

  static nowIso_() {
    return new Date().toISOString();
  }

  static toString_(value) {
    return String(value == null ? '' : value).trim();
  }

  static isCourseSyncEnabled_(value) {
    if (value === true) {
      return true;
    }
    const normalized = this.toString_(value).toLowerCase();
    return normalized === '1' || normalized === 'true';
  }

  static formatCourseSyncValue_(enabled) {
    return enabled === true ? '1' : '';
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
}

class TokenService {
  static createRosterKey(courseId, studentId) {
    const normalizedCourseId = String(courseId || '').trim();
    const normalizedStudentId = String(studentId || '').trim();
    return normalizedCourseId === '' || normalizedStudentId === '' ? '' : `${normalizedCourseId}::${normalizedStudentId}`;
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
        const reuseExisting = existing && existing.revoked !== true && String(existing.token || '').trim() !== '';
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
          note: reuseExisting ? String(existing.note || '').trim() : ''
        };
      });
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
    SheetRepository.assertManagementSchemaReady();
    const baseUrl = this.resolveStudentWebAppUrl_(options && options.baseUrl);
    const issuedAt = new Date().toISOString();
    const students = SheetRepository.getStudentsForCheckedCourses();
    const existingRows = SheetRepository.readTokenRows();
    const touchedKeys = new Set(students.map((student) => student.rosterKey));
    const preservedRows = existingRows.filter((row) => !touchedKeys.has(row.rosterKey));
    const issuedRows = this.buildTokenRowsForStudents(students, existingRows, baseUrl, issuedAt);
    SheetRepository.writeTokenRows([...preservedRows, ...issuedRows]);
    return {
      issued: issuedRows.length,
      rows: issuedRows
    };
  }

  static issueTokensForActiveStudents(options) {
    SheetRepository.assertManagementSchemaReady();
    const baseUrl = this.resolveStudentWebAppUrl_(options && options.baseUrl);
    const issuedAt = new Date().toISOString();
    const students = SheetRepository.getActiveStudents();
    const existingRows = SheetRepository.readTokenRows();
    const touchedKeys = new Set(students.map((student) => student.rosterKey));
    const preservedRows = existingRows.filter((row) => !touchedKeys.has(row.rosterKey));
    const issuedRows = this.buildTokenRowsForStudents(students, existingRows, baseUrl, issuedAt);
    SheetRepository.writeTokenRows([...preservedRows, ...issuedRows]);
    return {
      issued: issuedRows.length,
      rows: issuedRows
    };
  }

  static reissueStudentToken(rosterKey, options) {
    SheetRepository.assertManagementSchemaReady();
    const baseUrl = this.resolveStudentWebAppUrl_(options && options.baseUrl);
    const rows = SheetRepository.readTokenRows();
    const result = this.reissueTokenRowsForRosterKey(rows, rosterKey, baseUrl, new Date().toISOString());
    SheetRepository.writeTokenRows(result.rows);
    return result.updated;
  }

  static revokeStudentToken(rosterKey) {
    SheetRepository.assertManagementSchemaReady();
    const rows = SheetRepository.readTokenRows();
    const result = this.revokeTokenRowsForRosterKey(rows, rosterKey, new Date().toISOString());
    SheetRepository.writeTokenRows(result.rows);
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
    if (tokenRow.revoked === true || String(tokenRow.revoked || '').toLowerCase() === 'true') {
      throw new Error('このtokenは無効化されています。');
    }
    if (String(tokenRow.rosterKey || '').trim() === '') {
      throw new Error('tokenに対応するrosterKeyが空です。');
    }
    return tokenRow;
  }

  static validateToken(token) {
    const normalizedToken = String(token || '').trim();
    if (normalizedToken === '') {
      throw new Error('tokenが空です。');
    }
    const tokenRow = SheetRepository.findToken(normalizedToken);
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
  static generateProblem(levelOrOptions) {
    const options = typeof levelOrOptions === 'object' && levelOrOptions !== null ? levelOrOptions : { level: levelOrOptions };
    const level = this.normalizeLevel_(options.level);
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
    const substance = this.pickSubstance_(type.requiresGasAtSTP === true);
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
      given = { value: this.roundToSignificantDigits(particles, significantDigits), unit: '個' };
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
      given = { value: this.roundToSignificantDigits(particles, significantDigits), unit: '個' };
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
      given = { value: this.roundToSignificantDigits(particles, significantDigits), unit: '個' };
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
      requiresRounding: profile.level === 'advanced' && this.requiresRounding_(expectedAnswer, roundedExpected),
      explanation: ''
    };
    problem.givenValues = this.buildGivenValues_(problem, profile);
    problem.givenValuesTitle = this.getGivenValuesTitle_(problem);
    return problem;
  }

  static getExpectedAnswerForLevel_(rawExpected, roundedExpected, level) {
    return this.normalizeLevel_(level) === 'advanced' ? roundedExpected : Number(rawExpected);
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
    if (this.normalizeLevel_(profile && profile.level) === 'advanced') {
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
    let value = fallback;
    try {
      const numeric = Number(SheetRepository.getSettingValue(key));
      if (Number.isFinite(numeric) && numeric > 0) {
        value = numeric;
      }
    } catch (_ignored) {
      // Problem generation also runs in local tests and before setup; use level defaults then.
    }
    cache[key] = value;
    return value;
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
    const normalized = String(level || 'beginner').trim().toLowerCase();
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
    if (problem.level === 'advanced') {
      if (problem.unit === '個' || Math.abs(Number(problem.expectedAnswer || 0)) >= 100000) {
        return '有効数字3桁で答えよう。例: 6.02e23 または 6.02×10^23';
      }
      return `有効数字3桁で答えよう。単位 ${problem.unit} は入力しません。`;
    }
    if (problem.unit === '個' || Math.abs(Number(problem.expectedAnswer || 0)) >= 100000) {
      return '数値のみ。例: 6e23 または 6×10^23';
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

class AnswerService {
  static initializeTeacherPreviewSession(authToken, options) {
    AdminService.assertAdminAccess(authToken);
    const student = this.getTeacherPreviewStudent_(options && options.studentToken);
    return {
      ok: true,
      teacherPreview: true,
      student,
      summary: this.buildTeacherPreviewSummary_(student),
      problem: MolProblemService.issueProblemForToken(this.createTeacherPreviewProblemKey_(authToken), options || {}).publicProblem
    };
  }

  static getTeacherPreviewProblem(authToken, options) {
    AdminService.assertAdminAccess(authToken);
    return MolProblemService.issueProblemForToken(this.createTeacherPreviewProblemKey_(authToken), options || {}).publicProblem;
  }

  static submitTeacherPreviewAnswer(authToken, request) {
    AdminService.assertAdminAccess(authToken);
    const source = request || {};
    const submittedProblem = source.problem || {};
    const problem = MolProblemService.getStoredProblemForToken(this.createTeacherPreviewProblemKey_(authToken), submittedProblem.attemptId);
    const submittedProblemId = String(submittedProblem.problemId || '').trim();
    if (submittedProblemId !== '' && submittedProblemId !== String(problem.problemId || '').trim()) {
      throw new Error('送信された問題IDと保存済み問題が一致しません。新しい問題を取得してください。');
    }
    const grade = MolProblemService.gradeProblemAnswer(problem, source.submittedAnswer);
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
    const nextProblem = MolProblemService.issueProblemForToken(this.createTeacherPreviewProblemKey_(authToken), {
      level: source.nextLevel || problem.level
    }).publicProblem;
    return this.buildSubmitAnswerResponse(entry, this.buildTeacherPreviewSummary_(student), nextProblem);
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
    const tokenRow = this.requireActiveToken_(token);
    this.recordStudentAccess_(tokenRow);
    const summary = this.getStudentAnswerSummaryFromCache_(tokenRow);
    const firstProblem = this.issueProblemForStudent_(tokenRow, options || {}).publicProblem;
    return {
      ok: true,
      student: this.toPublicStudent_(tokenRow),
      summary,
      problem: firstProblem
    };
  }

  static recordStudentAccess_(tokenRow) {
    if (typeof SpreadsheetApp === 'undefined') {
      return;
    }
    const token = String(tokenRow && tokenRow.token || '').trim();
    // lastAccessedAt更新は初回アクセス時に集中するため、短時間の再アクセスはスロットリングする。
    if (token === '' || this.hasRecentStudentAccessRecord_(token)) {
      return;
    }
    try {
      SheetRepository.withDocumentLock(() => {
        SheetRepository.recordTokenAccess(token, new Date().toISOString());
      });
      this.rememberStudentAccessRecord_(token);
    } catch (error) {
      LoggerService.logDeveloperError(`Failed to record student access for ${tokenRow && tokenRow.rosterKey}`, error);
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

  static getStudentState(token) {
    const tokenRow = this.requireActiveToken_(token);
    return {
      student: this.toPublicStudent_(tokenRow),
      summary: this.getStudentAnswerSummaryFromCache_(tokenRow)
    };
  }

  static getPracticeProblem(token, options) {
    const tokenRow = this.requireActiveToken_(token);
    return this.issueProblemForStudent_(tokenRow, options || {}).publicProblem;
  }

  static issueProblemForStudent_(tokenRow, options) {
    const issueOptions = AdaptiveProblemService.buildIssueOptionsForStudent(tokenRow, options || {});
    const issued = MolProblemService.issueProblemForToken(tokenRow.token, issueOptions);
    if (AdaptiveProblemService.isEnabled(options || {})) {
      AdaptiveProblemService.rememberIssuedProblemType(tokenRow, issued.problem.level, issued.problem.problemType);
    }
    return issued;
  }

  static submitAnswer(request) {
    const startedAtMs = Date.now();
    let tokenRow = null;
    let attemptId = '';
    let duplicate = false;
    let cacheUpdated = false;
    let problemTypeCacheUpdated = false;
    let aggregatePath = '';
    try {
      tokenRow = this.requireActiveToken_(request && request.token);
      const submittedProblem = request.problem || {};
      const problem = MolProblemService.getStoredProblemForToken(tokenRow.token, submittedProblem.attemptId);
      const submittedProblemId = String(submittedProblem.problemId || '').trim();
      if (submittedProblemId !== '' && submittedProblemId !== String(problem.problemId || '').trim()) {
        throw new Error('送信された問題IDと保存済み問題が一致しません。新しい問題を取得してください。');
      }
      const grade = MolProblemService.gradeProblemAnswer(problem, request.submittedAnswer);
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
        clientInfo: JSON.stringify(this.buildAnswerClientInfo_(request.clientInfo, grade))
      };
      attemptId = entry.attemptId;
      let logEntry = entry;
      let summary = null;
      SheetRepository.withDocumentLock(() => {
        // 同じattemptIdの再送は既存ログを返し、解答ログを二重に増やさない。
        const existingLog = SheetRepository.findAnswerLogByAttemptId(entry.rosterKey, entry.attemptId);
        if (existingLog) {
          logEntry = this.toEntryFromExistingLog_(existingLog);
          duplicate = true;
        } else {
          SheetRepository.appendAnswerLog(entry);
        }
        let aggregateRow = null;
        try {
          aggregateRow = SheetRepository.findAggregateCacheByRosterKey(tokenRow.rosterKey);
        } catch (error) {
          LoggerService.logDeveloperError(`Failed to read aggregate cache row for ${tokenRow.rosterKey}`, error);
        }
        if (duplicate) {
          const recentRows = this.readLatestAnswerLogsForRosterKeySafely_(tokenRow.rosterKey, logEntry);
          summary = this.buildFastStudentAnswerSummary_(tokenRow, aggregateRow, logEntry, recentRows, false);
          aggregatePath = aggregateRow ? 'fast path duplicate' : 'duplicate without cache update';
          return;
        }
        if (aggregateRow) {
          const recentRows = this.readLatestAnswerLogsForRosterKeySafely_(tokenRow.rosterKey, logEntry);
          summary = this.buildFastStudentAnswerSummary_(tokenRow, aggregateRow, logEntry, recentRows, true);
          aggregatePath = 'fast path';
          try {
            SheetRepository.upsertAggregateCacheRow(summary);
            cacheUpdated = true;
          } catch (error) {
            LoggerService.logDeveloperError(`Failed to update aggregate cache for ${tokenRow.rosterKey}`, error);
          }
          problemTypeCacheUpdated = this.updateProblemTypeStatsCacheAfterAppend_(tokenRow, entry, null) || problemTypeCacheUpdated;
          return;
        }
        const fullRows = SheetRepository.readAnswerLogsForRosterKey(tokenRow.rosterKey);
        summary = this.buildStudentAnswerSummaryFromLogs_(tokenRow, fullRows);
        aggregatePath = 'full rebuild fallback';
        try {
          SheetRepository.upsertAggregateCacheRow(summary);
          cacheUpdated = true;
        } catch (error) {
          LoggerService.logDeveloperError(`Failed to rebuild aggregate cache for ${tokenRow.rosterKey}`, error);
        }
        problemTypeCacheUpdated = this.updateProblemTypeStatsCacheAfterAppend_(tokenRow, entry, fullRows) || problemTypeCacheUpdated;
      });
      AdaptiveProblemService.clearStatsCache(tokenRow.rosterKey, entry.level);
      const nextProblem = this.issueProblemForStudent_(tokenRow, {
        level: request.nextLevel || problem.level
      }).publicProblem;
      return {
        ...this.buildSubmitAnswerResponse(logEntry, summary, nextProblem),
        duplicate
      };
    } finally {
      LoggerService.logDeveloperInfo(`submitAnswer elapsedMs=${Date.now() - startedAtMs} rosterKey=${tokenRow ? tokenRow.rosterKey : ''} attemptId=${attemptId} duplicate=${duplicate} aggregatePath=${aggregatePath} cacheUpdated=${cacheUpdated} problemTypeCacheUpdated=${problemTypeCacheUpdated}`);
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

  static incrementLevelMetricsFromAggregate_(base, entry, appended, recentSummary) {
    const output = {};
    ['beginner', 'intermediate', 'advanced'].forEach((level) => {
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
      ...this.summarizeSingleLevelMetrics_(rows, recentRows, 'advanced')
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
        submittedAnswerText: this.formatAnswerText_(entry.normalizedSubmittedAnswer || entry.submittedAnswer, entry.unit, entry.significantDigits, entry.level),
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

  static buildAnswerClientInfo_(clientInfo, grade) {
    const base = this.parseClientInfo_(clientInfo);
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
      formatted = MolProblemService.normalizeLevel_(level) === 'advanced'
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

  static requireActiveToken_(token) {
    try {
      return TokenService.validateToken(token);
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
      if (rosterKey === '') {
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
      if (rosterKey === '' || level === '' || problemType === '') {
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
        const hasActiveToken = String(token.token || '').trim() !== '' && token.revoked !== true && String(token.revoked || '').toLowerCase() !== 'true';
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
          advancedAttempts
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
    if (row.advancedAttempts > 0 && row.recent10Attempts >= 10 && row.recent10Accuracy >= 0.7) {
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
      if (rowToken === '' || key === '' || row.revoked === true || String(row.revoked || '').toLowerCase() === 'true') {
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
    SheetRepository.assertManagementSchemaReady();
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
    SheetRepository.assertManagementSchemaReady();
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

  static getClassroomSendSettings_(options) {
    const batchSize = this.normalizeBatchSize_(
      options.batchSize,
      Number(SheetRepository.getSettingValue('CLASSROOM_SEND_BATCH_SIZE') || SheetRepository.getSettingValue('CLASSROOM_DISTRIBUTION_BATCH_SIZE') || MOL_DRILL_DEFAULT_CLASSROOM_SEND_BATCH_SIZE)
    );
    const dryRun = typeof options.dryRun === 'boolean' ? options.dryRun : this.toBoolean_(SheetRepository.getSettingValue('DRY_RUN'), false);
    const enableDistributionLog = typeof options.enableDistributionLog === 'boolean' ? options.enableDistributionLog : this.toBoolean_(SheetRepository.getSettingValue('ENABLE_DISTRIBUTION_LOG'), true);
    const template = String(options.postTextTemplate || SheetRepository.getSettingValue('POST_TEXT_TEMPLATE') || SheetRepository.getSettingValue('classroomPostTextTemplate') || MOL_DRILL_DEFAULT_POST_TEXT_TEMPLATE);
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

function onOpen(e) {
  molDrillOnOpen(e);
}

function molDrillOnOpen(_e) {
  const ui = SpreadsheetApp.getUi();
  const setupMenu = ui.createMenu('初期設定・同期')
    .addItem('管理シートを作成・補修', 'setupSheetsFromMenu')
    .addItem('Classroom一覧を取得', 'refreshClassroomListFromMenu')
    .addItem('生徒名簿を取得', 'refreshStudentsForCheckedCoursesFromMenu')
    .addItem('トークンを発行', 'issueTokensForActiveStudentsFromMenu');
  const distributionMenu = ui.createMenu('配付')
    .addItem('配付対象を確認', 'previewDistributionTargetsFromMenu')
    .addItem('DRY_RUNでURL配付確認', 'dryRunStudentUrlDistributionFromMenu')
    .addItem('URLをClassroomに配付', 'distributeStudentUrlsForCheckedCoursesFromMenu')
    .addItem('失敗分を再送', 'retryFailedStudentUrlDistributionsFromMenu');
  const maintenanceMenu = ui.createMenu('保守')
    .addItem('管理データを全削除して初期状態に戻す', 'reinitializeSheetsFromMenu');
  ui.createMenu(MOL_DRILL_APP_NAME)
    .addItem('管理ダッシュボードを開く', 'openAdminDialog')
    .addItem('集計キャッシュを更新', 'rebuildAggregateCacheFromMenu')
    .addSubMenu(setupMenu)
    .addSubMenu(distributionMenu)
    .addSubMenu(maintenanceMenu)
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
  if (AdminService.isAdminRoute(e)) {
    return HtmlService.createHtmlOutput('<p>管理画面はスプレッドシートの `もるくえ！` メニューから開いてください。</p>')
      .setTitle('管理画面はスプレッドシートから開いてください');
  }
  const template = HtmlService.createTemplateFromFile('Student');
  template.initialToken = token;
  template.initialAdminToken = '';
  template.initialTeacherPreview = false;
  return template.evaluate().setTitle(MOL_DRILL_APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function openAdminDialog() {
  const template = HtmlService.createTemplateFromFile('Admin');
  // TODO: Replace this hidden internal token with a short-lived admin-dialog nonce.
  template.initialAdminToken = AdminService.getOrCreateAdminToken();
  const output = template.evaluate().setTitle(MOL_DRILL_ADMIN_APP_NAME).setWidth(1280).setHeight(860).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(output, MOL_DRILL_ADMIN_APP_NAME);
}

function setupSheets() {
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

function setupSheetsFromMenu() {
  return runMenuOperation_(
    '管理シートを作成・補修',
    'MENU_SETUP_SHEETS',
    () => setupSheets(),
    (result) => result.message || '管理シートを作成・補修しました。'
  );
}

function reinitializeSheets() {
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

function rebuildAggregateCacheFromMenu() {
  return runMenuOperation_(
    '集計キャッシュを更新',
    'MENU_REBUILD_AGGREGATE_CACHE',
    () => AdminService.withAdminActionLock('rebuildAggregateCacheFromMenu', () => AggregationService.rebuildAggregateCache()),
    (result) => `集計キャッシュを更新しました: ${result.updated || 0}人 / 問題タイプ別 ${result.problemTypeUpdated || 0}行`
  );
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

function saveAdminSettings(authToken, settings) {
  return AdminService.saveAdminSettings(authToken, settings || {});
}

function getAdminSettings(authToken) {
  return AdminService.getAdminSettings(authToken);
}

function saveCourseSyncSelection(authToken, selectedCourseIds) {
  return AdminService.saveCourseSyncSelection(authToken, selectedCourseIds || []);
}

function buildAdminDashboardOverview_(authToken) {
  SheetRepository.assertManagementSchemaReady();
  const courses = SheetRepository.readCourseRows();
  const students = SheetRepository.readStudentRows();
  const summaries = SheetRepository.readAggregateCache();
  const tokens = SheetRepository.readTokenRows();
  const distributionStatusRows = SheetRepository.readDistributionStatusRows();
  const progressRows = AggregationService.buildAdminProgressRows(students, summaries, tokens, distributionStatusRows);
  const latestRunLogs = SheetRepository.readLatestRunLogs(1);
  const activeStudents = students.filter((row) => row.status !== '退籍').length;
  const activeTokens = tokens.filter((row) => row.token && !row.revoked).length;
  const failedDistributionCount = progressRows.filter((row) => row.distributionStatus === '配付失敗').length;
  return {
    appName: MOL_DRILL_APP_NAME,
    appVersion: MOL_DRILL_APP_VERSION,
    schemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
    settings: AdminService.readAdminSettings_(),
    courses,
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
      revokedCount: tokens.filter((row) => row.revoked).length
    },
    distributionOverview: {
      failedCount: failedDistributionCount,
      previewLoaded: false
    },
    summaries,
    progressRows,
    dashboardMetrics: AggregationService.buildAdminDashboardMetrics(progressRows),
    latestRunLog: latestRunLogs.length > 0 ? latestRunLogs[0] : null,
    sheetLinks: AdminService.getSheetLinks()
  };
}

function getAdminDashboardOverview(authToken) {
  AdminService.assertAdminAccess(authToken);
  return buildAdminDashboardOverview_(authToken);
}

function getStudentAnswerHistory(authToken, rosterKey, limit) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.assertManagementSchemaReady();
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

function getStudentProblemTypeStats(authToken, rosterKey) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.assertManagementSchemaReady();
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

function getAdminLogData(authToken) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.assertManagementSchemaReady();
  const runLogs = SheetRepository.readLatestRunLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse();
  return {
    answerLogs: SheetRepository.readLatestAnswerLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse(),
    distributionLogs: SheetRepository.readLatestDistributionLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse(),
    runLogs,
    latestRunLog: runLogs.length > 0 ? runLogs[0] : null,
    sheetLinks: AdminService.getSheetLinks()
  };
}

function getAdminDistributionPreviewData(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.assertManagementSchemaReady();
  return {
    distributionPreview: DistributionService.getDistributionTargetsPreview(options || {}),
    distributionLogs: SheetRepository.readLatestDistributionLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse()
  };
}

function getAdminRosterData(authToken) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.assertManagementSchemaReady();
  return {
    courses: SheetRepository.readCourseRows(),
    students: SheetRepository.readStudentRows(),
    tokens: SheetRepository.readTokenRows()
  };
}

function getAdminDashboardData(authToken) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.ensureSheets();
  const overview = buildAdminDashboardOverview_(authToken);
  const students = SheetRepository.readStudentRows();
  const summaries = SheetRepository.readAggregateCache();
  const tokens = SheetRepository.readTokenRows();
  const distributionLogs = SheetRepository.readDistributionLogs();
  const progressRows = AggregationService.buildAdminProgressRows(students, summaries, tokens, distributionLogs);
  const latestDistributionLogs = SheetRepository.readLatestDistributionLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse();
  const latestRunLogs = SheetRepository.readLatestRunLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse();
  return {
    ...overview,
    students,
    tokens,
    summaries,
    progressRows,
    dashboardMetrics: AggregationService.buildAdminDashboardMetrics(progressRows),
    distributionPreview: DistributionService.getDistributionTargetsPreview({}),
    distributionLogs: latestDistributionLogs,
    answerLogs: SheetRepository.readLatestAnswerLogs(MOL_DRILL_ADMIN_LOG_LIMIT).reverse(),
    runLogs: latestRunLogs,
    latestRunLog: latestRunLogs.length > 0 ? latestRunLogs[0] : null,
    sheetLinks: AdminService.getSheetLinks()
  };
}

function getAdminDashboardState(authToken) {
  return getAdminDashboardData(authToken);
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
