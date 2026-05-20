// Mol Calculation Drill - Google Apps Script / V8 / HTMLService

const MOL_DRILL_APP_NAME = 'Classroom連携型 モル計算ドリル';
const MOL_DRILL_APP_VERSION = '0.1.0';
const MOL_DRILL_EXPECTED_SCHEMA_VERSION = '11';
const MOL_DRILL_ADMIN_TOKEN_SETTING_KEY = 'ADMIN_TOKEN';
const MOL_DRILL_ADMIN_TOKEN_PROPERTY_KEY = 'MOL_DRILL_ADMIN_TOKEN';

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
    checkboxHeaders: ['同期対象'],
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
    headers: ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'revoked', 'note'],
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
      'explanation',
      'elapsedMs',
      'clientInfo'
    ],
    description: '生徒ごとの解答履歴を追記で記録します。',
    checkboxHeaders: ['isCorrect'],
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
      'intermediateAttempts',
      'advancedAttempts',
      'lastAnsweredAt'
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
      { header: 'intermediateAttempts', width: 160 },
      { header: 'advancedAttempts', width: 140 },
      { header: 'lastAnsweredAt', width: 180 }
    ]
  },
  {
    name: '実行ログ',
    headers: ['runId', 'parentRunId', 'operation', 'startedAt', 'finishedAt', 'processedCount', 'successCount', 'errorCount', 'skippedCount', 'nextAction'],
    description: 'トークン発行、Classroom配付、集計更新などの実行単位ログです。',
    columnWidths: [
      { header: 'runId', width: 220 },
      { header: 'parentRunId', width: 220 },
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
  { key: MOL_DRILL_ADMIN_TOKEN_SETTING_KEY, value: '', description: '管理画面URLで使う管理者トークン。Script Propertiesにも保存します。' },
  { key: 'POST_TEXT_TEMPLATE', value: 'モル計算ドリルはこちらです。\n\n{{氏名}} さん専用URL:\n{{studentUrl}}\n\nこのURLは本人専用です。他の人に共有しないでください。', description: 'Classroom個別お知らせ本文テンプレート' },
  { key: 'CLASSROOM_SEND_BATCH_SIZE', value: '30', description: 'Classroom URL配付の1回あたり最大件数' },
  { key: 'DRY_RUN', value: 'false', description: 'true の場合、Classroom投稿を作成せず配付ログだけ記録します。' },
  { key: 'ENABLE_DISTRIBUTION_LOG', value: 'true', description: 'true の場合、配付結果を配付ログへ記録します。' },
  { key: 'AVOGADRO_CONSTANT', value: '6.02e23', description: '問題生成と採点に使うアボガドロ定数' },
  { key: 'DEFAULT_TOLERANCE', value: '0.01', description: '数値解答の既定相対許容誤差' }
];

class LoggerService {
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

  static extractAdminToken(e) {
    const params = e && e.parameter ? e.parameter : {};
    return String(params.admin || params.adminToken || '').trim();
  }

  static normalizeSettingsPayload(payload) {
    const source = payload || {};
    return {
      webAppUrl: String(source.webAppUrl || '').trim(),
      adminToken: String(source.adminToken || '').trim(),
      postTextTemplate: String(source.postTextTemplate || '').trim(),
      dryRun: source.dryRun === true || String(source.dryRun || '').toLowerCase() === 'true',
      batchSize: this.normalizeBatchSize_(source.batchSize, 30),
      enableDistributionLog: source.enableDistributionLog !== false && String(source.enableDistributionLog || 'true').toLowerCase() !== 'false'
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
      throw new Error('管理者トークンが未設定です。Spreadsheetのメニューから管理画面を開き、初期設定で管理者トークンを保存してください。');
    }
    if (String(authToken || '').trim() !== configured) {
      throw new Error('管理者トークンが一致しません。管理画面URLを確認してください。');
    }
    return true;
  }

  static getOrCreateAdminToken() {
    const existing = this.getAdminToken();
    if (existing !== '') {
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
      SheetRepository.setSettingValue(MOL_DRILL_ADMIN_TOKEN_SETTING_KEY, normalized, '管理画面URLで使う管理者トークン。Script Propertiesにも保存します。');
    } catch (_ignored) {
      // Settings sheet may not exist yet during the first bootstrap.
    }
    return normalized;
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
      { key: 'ENABLE_DISTRIBUTION_LOG', value: String(settings.enableDistributionLog), description: 'true の場合、配付結果を配付ログへ記録します。' }
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
    return SheetRepository.setCourseSyncSelection(selectedCourseIds || []);
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
    const batchSize = this.normalizeBatchSize_(SheetRepository.getSettingValue('CLASSROOM_SEND_BATCH_SIZE'), 30);
    return {
      webAppUrl: SheetRepository.getSettingValue('WEB_APP_URL'),
      adminTokenConfigured: this.getAdminToken() !== '',
      postTextTemplate: SheetRepository.getSettingValue('POST_TEXT_TEMPLATE'),
      dryRun: this.toBoolean_(SheetRepository.getSettingValue('DRY_RUN'), false),
      batchSize,
      enableDistributionLog: this.toBoolean_(SheetRepository.getSettingValue('ENABLE_DISTRIBUTION_LOG'), true)
    };
  }

  static normalizeBatchSize_(value, fallback) {
    const numeric = Number(value || fallback || 30);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 30;
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

  static ensureSheets() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = this.ensureSheet_(spreadsheet, definition);
      this.initializeSheet_(sheet, definition);
    }
    this.setSettingValue('schemaVersion', MOL_DRILL_EXPECTED_SCHEMA_VERSION, '管理シート構造のスキーマバージョン');
    AdminService.getOrCreateAdminToken();
    return {
      ok: true,
      schemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
      message: 'モル計算ドリル管理シートを初期化しました。'
    };
  }

  static backupAndReinitializeSheets() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const suffix = this.formatBackupTimestamp_(new Date());
    const backupSheets = [];
    for (const definition of MOL_DRILL_SHEETS) {
      const sheet = spreadsheet.getSheetByName(definition.name);
      if (sheet) {
        const backupName = `${definition.name}_backup_${suffix}`;
        sheet.setName(backupName);
        backupSheets.push(backupName);
      }
    }
    const result = this.ensureSheets();
    return {
      ...result,
      backupSheets,
      message: `管理シートをバックアップして再初期化しました（backup: ${backupSheets.length}件）。`
    };
  }

  static getSchemaStatus() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const missingSheets = [];
    const missingHeadersBySheet = [];
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
    }
    const schemaVersion = this.getSettingValue_('schemaVersion');
    const versionOk = schemaVersion === MOL_DRILL_EXPECTED_SCHEMA_VERSION;
    return {
      ok: missingSheets.length === 0 && missingHeadersBySheet.length === 0 && versionOk,
      expectedSchemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
      schemaVersion,
      missingSheets,
      missingHeadersBySheet
    };
  }

  static assertManagementSchemaReady() {
    const status = this.getSchemaStatus();
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
        existing.get(this.toString_(course.courseId)) === true
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
        checked: row[headerMap['同期対象'] - 1] === true
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
        revoked: row[headerMap.revoked - 1] === true || this.toString_(row[headerMap.revoked - 1]).toLowerCase() === 'true',
        note: this.toString_(row[headerMap.note - 1])
      }))
      .filter((row) => row.token !== '' || row.rosterKey !== '');
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
      row.revoked === true,
      row.note || ''
    ]);
    this.writeRowsByHeaders_(sheet, headerMap, this.getSheetDefinition_('トークン管理').headers, values);
  }

  static findToken(token) {
    const normalizedToken = this.toString_(token);
    return this.readTokenRows().find((row) => row.token === normalizedToken) || null;
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
    return this.readAnswerLogs()
      .find((row) => row.rosterKey === normalizedRosterKey && row.attemptId === normalizedAttemptId) || null;
  }

  static readAnswerLogsForRosterKey(rosterKey) {
    const normalizedRosterKey = this.toString_(rosterKey);
    if (normalizedRosterKey === '') {
      return [];
    }
    return this.readAnswerLogs().filter((row) => row.rosterKey === normalizedRosterKey);
  }

  static readAnswerLogs() {
    const sheet = this.getManagedSheet_('解答ログ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    return this.getBodyValues_(sheet)
      .map((row) => ({
        timestamp: this.toString_(row[headerMap.timestamp - 1]),
        attemptId: this.toString_(row[headerMap.attemptId - 1]),
        token: this.toString_(row[headerMap.token - 1]),
        courseId: this.toString_(row[headerMap.courseId - 1]),
        courseName: this.toString_(row[headerMap.courseName - 1]),
        rosterKey: this.toString_(row[headerMap.rosterKey - 1]),
        studentId: this.toString_(row[headerMap.studentId - 1]),
        number: this.toString_(row[headerMap['出席番号'] - 1]),
        name: this.toString_(row[headerMap['氏名'] - 1]),
        level: this.toString_(row[headerMap.level - 1]),
        problemType: this.toString_(row[headerMap.problemType - 1]),
        questionText: this.toString_(row[headerMap.questionText - 1]),
        expectedAnswer: this.toString_(row[headerMap.expectedAnswer - 1]),
        submittedAnswer: this.toString_(row[headerMap.submittedAnswer - 1]),
        normalizedSubmittedAnswer: this.toString_(row[headerMap.normalizedSubmittedAnswer - 1]),
        unit: this.toString_(row[headerMap.unit - 1]),
        isCorrect: row[headerMap.isCorrect - 1] === true || this.toString_(row[headerMap.isCorrect - 1]).toLowerCase() === 'true',
        tolerance: this.toString_(row[headerMap.tolerance - 1]),
        significantDigits: this.toString_(row[headerMap.significantDigits - 1]),
        avogadroConstant: this.toString_(row[headerMap.avogadroConstant - 1]),
        explanation: this.toString_(row[headerMap.explanation - 1]),
        elapsedMs: Number(row[headerMap.elapsedMs - 1] || 0),
        clientInfo: this.toString_(row[headerMap.clientInfo - 1])
      }))
      .filter((row) => row.rosterKey !== '');
  }

  static upsertAggregateCacheRow(summary) {
    const sheet = this.getManagedSheet_('集計キャッシュ');
    const headerMap = this.getHeaderColumnMap_(sheet);
    const headers = this.getSheetDefinition_('集計キャッシュ').headers;
    const rows = this.readAggregateCache();
    const normalizedRosterKey = this.toString_(summary.rosterKey);
    const nextRows = rows.filter((row) => row.rosterKey !== normalizedRosterKey);
    nextRows.push(summary);
    nextRows.sort((a, b) => `${a.courseName} ${a.number} ${a.name}`.localeCompare(`${b.courseName} ${b.number} ${b.name}`, 'ja'));
    const values = nextRows.map((row) => [
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
      row.intermediateAttempts,
      row.advancedAttempts,
      row.lastAnsweredAt || ''
    ]);
    this.writeRowsByHeaders_(sheet, headerMap, headers, values);
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
      row.intermediateAttempts,
      row.advancedAttempts,
      row.lastAnsweredAt || ''
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
        intermediateAttempts: Number(row[headerMap.intermediateAttempts - 1] || 0),
        advancedAttempts: Number(row[headerMap.advancedAttempts - 1] || 0),
        lastAnsweredAt: headerMap.lastAnsweredAt ? this.toString_(row[headerMap.lastAnsweredAt - 1]) : ''
      }))
      .filter((row) => row.rosterKey !== '');
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
      .map((row) => ({
        timestamp: this.toString_(row[headerMap.timestamp - 1]),
        runId: this.toString_(row[headerMap.runId - 1]),
        courseId: this.toString_(row[headerMap.courseId - 1]),
        rosterKey: this.toString_(row[headerMap.rosterKey - 1]),
        studentId: this.toString_(row[headerMap.studentId - 1]),
        token: this.toString_(row[headerMap.token - 1]),
        studentUrl: this.toString_(row[headerMap.studentUrl - 1]),
        classroomAnnouncementId: this.toString_(row[headerMap.classroomAnnouncementId - 1]),
        status: this.toString_(row[headerMap.status - 1]),
        errorMessage: this.toString_(row[headerMap.errorMessage - 1])
      }))
      .filter((row) => row.token !== '' || row.rosterKey !== '');
  }

  static appendRunLog(log) {
    const sheet = this.getManagedSheet_('実行ログ');
    this.appendRows_(sheet, [[
      log.runId,
      log.parentRunId || '',
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
      .map((row) => ({
        runId: this.toString_(row[headerMap.runId - 1]),
        parentRunId: this.toString_(row[headerMap.parentRunId - 1]),
        operation: this.toString_(row[headerMap.operation - 1]),
        startedAt: this.toString_(row[headerMap.startedAt - 1]),
        finishedAt: this.toString_(row[headerMap.finishedAt - 1]),
        processedCount: Number(row[headerMap.processedCount - 1] || 0),
        successCount: Number(row[headerMap.successCount - 1] || 0),
        errorCount: Number(row[headerMap.errorCount - 1] || 0),
        skippedCount: Number(row[headerMap.skippedCount - 1] || 0),
        nextAction: this.toString_(row[headerMap.nextAction - 1])
      }))
      .filter((row) => row.runId !== '');
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
      return;
    }
    if (nextHeaders.length > 0) {
      sheet.getRange(1, existingHeaderCount + 1, 1, nextHeaders.length).setValues([nextHeaders]);
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
    const rows = this.getBodyValues_(sheet);
    const existing = new Set(rows.map((row) => this.toString_(row[headerMap['キー'] - 1])));
    const now = this.nowIso_();
    const additions = MOL_DRILL_DEFAULT_SETTINGS
      .filter((setting) => !existing.has(setting.key))
      .map((setting) => [setting.key, setting.value || '', setting.description || '', now]);
    if (additions.length > 0) {
      this.appendRows_(sheet, additions);
    }
  }

  static getManagedSheet_(name) {
    this.assertManagementSchemaReady();
    return this.getManagedSheetWithoutSchemaCheck_(name);
  }

  static getManagedSheetWithoutSchemaCheck_(name) {
    const definition = this.getSheetDefinition_(name);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(definition.name);
    if (!sheet) {
      throw new Error(`管理シートが見つかりません: ${definition.name}`);
    }
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
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = {};
    headers.forEach((header, index) => {
      const key = this.toString_(header);
      if (key !== '') {
        map[key] = index + 1;
      }
    });
    return map;
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
      row.checked === true
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
    return parts.join('\n') || '管理シートのスキーマが不正です。';
  }

  static formatBackupTimestamp_(date) {
    return Utilities.formatDate ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') : date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  }

  static nowIso_() {
    return new Date().toISOString();
  }

  static toString_(value) {
    return String(value == null ? '' : value).trim();
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
    return this.validateTokenAgainstRows(token, SheetRepository.readTokenRows());
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
    problem.problemId = this.createProblemId_(problem);
    problem.attemptId = problem.problemId;
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
      level: problem.level,
      problemType: problem.problemType,
      problemTypeId: problem.problemTypeId,
      questionText: problem.questionText,
      givenValuesTitle: this.getGivenValuesTitle_(problem),
      givenValues: this.toPublicGivenValues_(problem.givenValues),
      unit: problem.unit,
      inputHint: this.createInputHint_(problem)
    };
  }

  static storeProblemForToken(token, problem) {
    const key = this.createStoredProblemKey_(token, problem.problemId);
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

  static getStoredProblemForToken(token, problemId) {
    const key = this.createStoredProblemKey_(token, problemId);
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
    if (!this.verifyProblemIntegrity(problem)) {
      throw new Error('保存済み問題データの整合性を確認できません。新しい問題を取得してください。');
    }
    return problem;
  }

  static createStoredProblemKey_(token, problemId) {
    return `molProblem:${this.hashString_(`${String(token || '').trim()}::${String(problemId || '').trim()}`)}`;
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
    const roundedExpected = this.roundToSignificantDigits(expectedAnswer, profile.significantDigits);
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
      rawExpectedAnswer: expectedAnswer,
      expectedAnswer: roundedExpected,
      displayAnswer: this.formatNumberForDisplay_(roundedExpected, profile.significantDigits),
      unit,
      tolerance: profile.tolerance,
      significantDigits: profile.significantDigits,
      avogadroConstant: profile.avogadroConstant,
      molarVolume: 22.4,
      requiresRounding: this.requiresRounding_(expectedAnswer, roundedExpected),
      explanation: ''
    };
    problem.givenValues = this.buildGivenValues_(problem, profile);
    problem.givenValuesTitle = this.getGivenValuesTitle_(problem);
    return problem;
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
      value: String(item.value || '')
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
    return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * factor) / factor;
  }

  static isAnswerCorrect(submitted, expected, tolerance, significantDigits) {
    const submittedNumber = this.normalizeNumericInput(submitted);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(submittedNumber) || !Number.isFinite(expectedNumber)) {
      return false;
    }
    const digits = Number(significantDigits || 3);
    const roundedSubmitted = this.roundToSignificantDigits(submittedNumber, digits);
    const roundedExpected = this.roundToSignificantDigits(expectedNumber, digits);
    if (Math.abs(roundedSubmitted - roundedExpected) <= Math.max(Math.abs(roundedExpected) * 1e-12, 1e-12)) {
      return true;
    }
    const normalizedTolerance = Number(tolerance || 0.01);
    const absoluteTolerance = normalizedTolerance;
    const relativeTolerance = Math.abs(expectedNumber) * normalizedTolerance;
    const allowed = Math.max(absoluteTolerance, relativeTolerance);
    return Math.abs(submittedNumber - expectedNumber) <= allowed;
  }

  static gradeProblemAnswer(problem, submittedAnswer) {
    if (!this.verifyProblemIntegrity(problem)) {
      throw new Error('問題データが改ざんされている可能性があります。新しい問題を取得してください。');
    }
    const normalizedSubmittedAnswer = this.normalizeNumericInput(submittedAnswer);
    return {
      normalizedSubmittedAnswer: Number.isFinite(normalizedSubmittedAnswer) ? normalizedSubmittedAnswer : '',
      isCorrect: this.isAnswerCorrect(submittedAnswer, problem.expectedAnswer, problem.tolerance, problem.significantDigits),
      tolerance: Number(problem.tolerance || 0.01)
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
    if (!problem || String(problem.problemId || '') === '') {
      return false;
    }
    return String(problem.problemId) === this.createProblemId_(problem);
  }

  static createProblemId_(problem) {
    return `MP_${this.hashString_(this.createProblemCanonicalString_(problem))}`;
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
      return {
        level: 'intermediate',
        typeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        avogadroConstant: 6.0e23,
        significantDigits: 3,
        tolerance: 0.01,
        molValues: [0.125, 0.25, 0.375, 0.5, 0.75, 1.25, 1.5, 2.5],
        advancedMolValues: [0.125, 0.25, 0.375, 0.5, 0.75, 1.25, 1.5, 2.5]
      };
    }
    if (level === 'advanced') {
      return {
        level: 'advanced',
        typeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        avogadroConstant: 6.02e23,
        significantDigits: 3,
        tolerance: 0.005,
        molValues: [0.137, 0.286, 0.734, 1.37, 2.48, 3.16],
        advancedMolValues: [0.137, 0.286, 0.734, 1.37, 2.48, 3.16]
      };
    }
    return {
      level: 'beginner',
      typeIds: [1, 2, 3, 4, 5, 6],
      avogadroConstant: 6.0e23,
      significantDigits: 2,
      tolerance: 0.01,
      molValues: [0.5, 1.0, 2.0, 3.0],
      advancedMolValues: [0.5, 1.0, 2.0, 3.0]
    };
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
    if (problem.unit === '個' || Math.abs(Number(problem.expectedAnswer || 0)) >= 100000) {
      return '数値のみ。例: 6.0e23 または 6.0×10^23';
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

class AnswerService {
  static initializeStudentSession(token, options) {
    const tokenRow = this.requireActiveToken_(token);
    const summary = this.getStudentAnswerSummary_(tokenRow);
    const firstProblem = MolProblemService.issueProblemForToken(tokenRow.token, options || {}).publicProblem;
    return {
      ok: true,
      student: this.toPublicStudent_(tokenRow),
      summary,
      problem: firstProblem
    };
  }

  static getStudentState(token) {
    const tokenRow = this.requireActiveToken_(token);
    return {
      student: this.toPublicStudent_(tokenRow),
      summary: this.getStudentAnswerSummary_(tokenRow)
    };
  }

  static getPracticeProblem(token, options) {
    const tokenRow = this.requireActiveToken_(token);
    return MolProblemService.issueProblemForToken(tokenRow.token, options || {}).publicProblem;
  }

  static submitAnswer(request) {
    const tokenRow = this.requireActiveToken_(request && request.token);
    const submittedProblem = request.problem || {};
    const problem = MolProblemService.getStoredProblemForToken(tokenRow.token, submittedProblem.problemId);
    const grade = MolProblemService.gradeProblemAnswer(problem, request.submittedAnswer);
    const now = new Date().toISOString();
    const entry = {
      timestamp: now,
      attemptId: String(problem.problemId || problem.attemptId || `ATT_${new Date().getTime()}`),
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
      significantDigits: problem.significantDigits || '',
      avogadroConstant: problem.avogadroConstant || '',
      explanation: String(problem.explanation || ''),
      elapsedMs: Number(request.elapsedMs || 0),
      clientInfo: JSON.stringify(request.clientInfo || {})
    };
    let logEntry = entry;
    let duplicate = false;
    SheetRepository.withDocumentLock(() => {
      const existingLog = SheetRepository.findAnswerLogByAttemptId(entry.rosterKey, entry.attemptId);
      if (existingLog) {
        logEntry = this.toEntryFromExistingLog_(existingLog);
        duplicate = true;
        return;
      }
      SheetRepository.appendAnswerLog(entry);
    });
    const summary = this.getStudentAnswerSummary_(tokenRow);
    try {
      SheetRepository.withDocumentLock(() => {
        SheetRepository.upsertAggregateCacheRow(summary);
      });
    } catch (error) {
      LoggerService.logDeveloperError(`Failed to update aggregate cache for ${tokenRow.rosterKey}`, error);
    }
    const nextProblem = MolProblemService.issueProblemForToken(tokenRow.token, {
      level: request.nextLevel || problem.level
    }).publicProblem;
    return {
      ...this.buildSubmitAnswerResponse(logEntry, summary, nextProblem),
      duplicate
    };
  }

  static summarizeAnswerLogsForStudent(rosterKey, logs) {
    const normalizedRosterKey = String(rosterKey || '').trim();
    const rows = (logs || [])
      .filter((row) => String(row.rosterKey || '').trim() === normalizedRosterKey)
      .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    const recentRows = rows.slice(-10);
    const totalCorrect = rows.filter((row) => row.isCorrect === true).length;
    const recentCorrect = recentRows.filter((row) => row.isCorrect === true).length;
    return {
      totalAttempts: rows.length,
      totalCorrect,
      totalAccuracy: this.roundRate_(totalCorrect, rows.length),
      recent10Attempts: recentRows.length,
      recent10Correct: recentCorrect,
      recent10Accuracy: this.roundRate_(recentCorrect, recentRows.length),
      beginnerAttempts: rows.filter((row) => row.level === 'beginner').length,
      intermediateAttempts: rows.filter((row) => row.level === 'intermediate').length,
      advancedAttempts: rows.filter((row) => row.level === 'advanced').length
    };
  }

  static buildSubmitAnswerResponse(entry, summary, nextProblem) {
    return {
      ok: true,
      result: {
        isCorrect: entry.isCorrect === true,
        expectedAnswerText: this.formatAnswerText_(entry.expectedAnswer, entry.unit, entry.significantDigits),
        submittedAnswerText: this.formatAnswerText_(entry.normalizedSubmittedAnswer || entry.submittedAnswer, entry.unit, entry.significantDigits),
        explanation: String(entry.explanation || ''),
        totalAttempts: Number(summary.totalAttempts || 0),
        totalCorrect: Number(summary.totalCorrect || 0),
        totalAccuracy: Number(summary.totalAccuracy || 0),
        recent10Attempts: Number(summary.recent10Attempts || 0),
        recent10Correct: Number(summary.recent10Correct || 0),
        recent10Accuracy: Number(summary.recent10Accuracy || 0)
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
      explanation: row.explanation,
      elapsedMs: row.elapsedMs,
      clientInfo: row.clientInfo
    };
  }

  static formatAnswerText_(value, unit, significantDigits) {
    const numeric = Number(value);
    const formatted = Number.isFinite(numeric)
      ? MolProblemService.formatNumberForDisplay_(numeric, Number(significantDigits || 3))
      : String(value == null ? '' : value);
    const normalizedUnit = String(unit || '').trim();
    return normalizedUnit === '' ? formatted : `${formatted} ${normalizedUnit}`;
  }

  static roundRate_(correct, attempts) {
    if (!attempts) {
      return 0;
    }
    return Math.round((correct / attempts) * 10000) / 10000;
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
        const recent = sorted.slice(-10);
        const totalCorrect = sorted.filter((row) => row.isCorrect === true).length;
        const recentCorrect = recent.filter((row) => row.isCorrect === true).length;
        const latest = sorted[sorted.length - 1] || {};
        return {
          updatedAt,
          courseId: String(latest.courseId || ''),
          courseName: String(latest.courseName || ''),
          rosterKey,
          studentId: String(latest.studentId || ''),
          number: String(latest.number || ''),
          name: String(latest.name || ''),
          totalAttempts: sorted.length,
          totalCorrect,
          totalAccuracy: this.roundRate_(totalCorrect, sorted.length),
          recent10Attempts: recent.length,
          recent10Correct: recentCorrect,
          recent10Accuracy: this.roundRate_(recentCorrect, recent.length),
          beginnerAttempts: sorted.filter((row) => row.level === 'beginner').length,
          intermediateAttempts: sorted.filter((row) => row.level === 'intermediate').length,
          advancedAttempts: sorted.filter((row) => row.level === 'advanced').length,
          lastAnsweredAt: String(latest.timestamp || '')
        };
      })
      .sort((a, b) => `${a.courseName} ${a.number} ${a.name}`.localeCompare(`${b.courseName} ${b.number} ${b.name}`, 'ja'));
  }

  static buildAdminProgressRows(students, summaries) {
    const summaryByRosterKey = new Map((summaries || []).map((summary) => [String(summary.rosterKey || '').trim(), summary]));
    return (students || [])
      .filter((student) => String(student.status || '在籍') !== '退籍')
      .map((student) => {
        const rosterKey = String(student.rosterKey || TokenService.createRosterKey(student.courseId, student.studentId)).trim();
        const summary = summaryByRosterKey.get(rosterKey) || {};
        const totalAttempts = Number(summary.totalAttempts || 0);
        const recent10Accuracy = Number(summary.recent10Accuracy || 0);
        const totalAccuracy = Number(summary.totalAccuracy || 0);
        let statusLabel = '良好';
        if (totalAttempts === 0) {
          statusLabel = '未実施';
        } else if ((Number(summary.recent10Attempts || 0) >= 5 && recent10Accuracy < 0.5) || (totalAttempts >= 5 && totalAccuracy < 0.5)) {
          statusLabel = '低正答率';
        } else if (Number(summary.recent10Attempts || 0) < 10) {
          statusLabel = '要観察';
        }
        return {
          courseId: String(student.courseId || summary.courseId || ''),
          courseName: String(student.courseName || summary.courseName || ''),
          rosterKey,
          studentId: String(student.studentId || summary.studentId || ''),
          number: String(student.number || summary.number || ''),
          name: String(student.name || summary.name || ''),
          totalAttempts,
          totalCorrect: Number(summary.totalCorrect || 0),
          totalAccuracy,
          recent10Attempts: Number(summary.recent10Attempts || 0),
          recent10Correct: Number(summary.recent10Correct || 0),
          recent10Accuracy,
          beginnerAttempts: Number(summary.beginnerAttempts || 0),
          intermediateAttempts: Number(summary.intermediateAttempts || 0),
          advancedAttempts: Number(summary.advancedAttempts || 0),
          lastAnsweredAt: String(summary.lastAnsweredAt || ''),
          statusLabel
        };
      })
      .sort((a, b) => `${a.courseName} ${a.number} ${a.name}`.localeCompare(`${b.courseName} ${b.number} ${b.name}`, 'ja'));
  }

  static rebuildAggregateCache() {
    const rows = this.buildAggregateRows(SheetRepository.readAnswerLogs(), new Date().toISOString());
    SheetRepository.writeAggregateCache(rows);
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
    const batchSize = this.normalizeBatchSize_(normalizedOptions.batchSize, 30);
    const courseIds = this.normalizeCourseIdSet_(normalizedOptions);
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
      const key = this.getDistributionIdentityKey_(row);
      if (key === '' || row.revoked === true || String(row.revoked || '').toLowerCase() === 'true') {
        continue;
      }
      if (courseIds.size > 0 && !courseIds.has(String(row.courseId || '').trim())) {
        continue;
      }
      if (sentKeys.has(key)) {
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
    const tokenRows = SheetRepository.readTokenRows();
    const logRows = SheetRepository.readDistributionLogs();
    const courseIds = this.resolveTargetCourseIds_(options || {});
    const settings = this.getClassroomSendSettings_(options || {});
    if (courseIds.length === 0) {
      return {
        courseIds: [],
        batchSize: settings.batchSize,
        dryRun: settings.dryRun,
        targetCount: 0,
        failedTargetCount: 0,
        targets: [],
        failedTargets: []
      };
    }
    const targets = this.buildDistributionTargets(tokenRows, logRows, {
      ...(options || {}),
      courseIds,
      batchSize: settings.batchSize
    });
    const failedTargets = this.buildDistributionTargets(tokenRows, logRows, {
      ...(options || {}),
      courseIds,
      retryFailedOnly: true,
      batchSize: settings.batchSize
    });
    return {
      courseIds,
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
    const courseIds = this.resolveTargetCourseIds_(normalizedOptions);
    if (courseIds.length === 0) {
      throw new Error('配付対象Classroomが選択されていません。Classroom一覧の同期対象をチェックしてください。');
    }
    const tokenRows = SheetRepository.readTokenRows();
    const logRows = SheetRepository.readDistributionLogs();
    const targets = this.buildDistributionTargets(tokenRows, logRows, {
      ...normalizedOptions,
      courseIds,
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
      Number(SheetRepository.getSettingValue('CLASSROOM_SEND_BATCH_SIZE') || SheetRepository.getSettingValue('CLASSROOM_DISTRIBUTION_BATCH_SIZE') || 30)
    );
    const dryRun = typeof options.dryRun === 'boolean' ? options.dryRun : this.toBoolean_(SheetRepository.getSettingValue('DRY_RUN'), false);
    const enableDistributionLog = typeof options.enableDistributionLog === 'boolean' ? options.enableDistributionLog : this.toBoolean_(SheetRepository.getSettingValue('ENABLE_DISTRIBUTION_LOG'), true);
    const template = String(options.postTextTemplate || SheetRepository.getSettingValue('POST_TEXT_TEMPLATE') || SheetRepository.getSettingValue('classroomPostTextTemplate') || 'モル計算ドリルはこちらです。\n\n{{氏名}} さん専用URL:\n{{studentUrl}}\n\nこのURLは本人専用です。他の人に共有しないでください。');
    return {
      batchSize,
      dryRun,
      enableDistributionLog,
      template
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
    const courseIds = [];
    if (options.courseId) {
      courseIds.push(options.courseId);
    }
    if (Array.isArray(options.courseIds)) {
      courseIds.push(...options.courseIds);
    }
    return new Set(courseIds.map((courseId) => String(courseId || '').trim()).filter((courseId) => courseId !== ''));
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
    const numeric = Number(value || fallback || 30);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 30;
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
  ui.createMenu('モル計算ドリル')
    .addItem('管理シートを初期化', 'setupSheetsFromMenu')
    .addItem('管理画面を開く', 'openAdminDialog')
    .addSeparator()
    .addItem('Classroom一覧を取得', 'refreshClassroomListFromMenu')
    .addItem('生徒名簿を取得', 'refreshStudentsForCheckedCoursesFromMenu')
    .addItem('トークンを発行', 'issueTokensForActiveStudentsFromMenu')
    .addItem('ClassroomへURLを配付', 'distributeStudentUrlsForCheckedCoursesFromMenu')
    .addItem('集計キャッシュを更新', 'rebuildAggregateCacheFromMenu')
    .addSeparator()
    .addItem('管理シート全初期化（バックアップあり）', 'backupAndReinitializeSheetsFromMenu')
    .addToUi();
}

function doGet(e) {
  const token = e && e.parameter ? String(e.parameter.t || e.parameter.token || '') : '';
  if (AdminService.isAdminRoute(e)) {
    const adminToken = AdminService.extractAdminToken(e);
    try {
      AdminService.assertAdminAccess(adminToken);
      const adminTemplate = HtmlService.createTemplateFromFile('Admin');
      adminTemplate.initialAdminToken = adminToken;
      return adminTemplate.evaluate().setTitle('モル計算ドリル 管理').setSandboxMode(HtmlService.SandboxMode.IFRAME);
    } catch (error) {
      return HtmlService.createHtmlOutput(`<p>管理画面を開けません。</p><p>${String(error && error.message ? error.message : error)}</p>`).setTitle('管理画面アクセス不可');
    }
  }
  const template = HtmlService.createTemplateFromFile('Student');
  template.initialToken = token;
  return template.evaluate().setTitle('モル計算ドリル').setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function openAdminDialog() {
  const template = HtmlService.createTemplateFromFile('Admin');
  template.initialAdminToken = AdminService.getOrCreateAdminToken();
  const output = template.evaluate().setTitle('モル計算ドリル 管理').setWidth(1280).setHeight(860).setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showModalDialog(output, 'モル計算ドリル 管理');
}

function setupSheets() {
  return SheetRepository.ensureSheets();
}

function setupSheetsFromMenu() {
  const result = setupSheets();
  SpreadsheetApp.getActiveSpreadsheet().toast(result.message, MOL_DRILL_APP_NAME, 5);
  return result;
}

function backupAndReinitializeSheets(confirmationText) {
  if (String(confirmationText || '').trim() !== '初期化') {
    throw new Error('管理シート全初期化を実行するには「初期化」と入力してください。');
  }
  return SheetRepository.backupAndReinitializeSheets();
}

function backupAndReinitializeSheetsFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('管理シート全初期化（バックアップあり）', '既存の管理シートをバックアップ名に変更してから、新しい管理シートを作ります。実行するには「初期化」と入力してください。', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return null;
  }
  const result = backupAndReinitializeSheets(response.getResponseText());
  SpreadsheetApp.getActiveSpreadsheet().toast(result.message, MOL_DRILL_APP_NAME, 8);
  return result;
}

function refreshClassroomListCore_() {
  const courses = ClassroomService.listTeacherCourses();
  SheetRepository.writeCourseListToSheet(courses);
  return courses;
}

function refreshClassroomList(authToken) {
  AdminService.assertAdminAccess(authToken);
  return refreshClassroomListCore_();
}

function refreshClassroomListFromMenu() {
  const courses = refreshClassroomListCore_();
  SpreadsheetApp.getActiveSpreadsheet().toast(`Classroom一覧を更新しました（${courses.length}件）。`, MOL_DRILL_APP_NAME, 5);
  return courses;
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
  return refreshStudentsForCheckedCoursesCore_();
}

function refreshStudentsForCheckedCoursesFromMenu() {
  const students = refreshStudentsForCheckedCoursesCore_();
  SpreadsheetApp.getActiveSpreadsheet().toast(`生徒名簿を更新しました（${SheetRepository.getCheckedCourses().length}クラス / ${students.length}人）。`, MOL_DRILL_APP_NAME, 5);
  return students;
}

function issueTokensForCheckedCourses(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return TokenService.issueTokensForCheckedCourses(options || {});
}

function issueTokensForActiveStudents(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return TokenService.issueTokensForActiveStudents(options || {});
}

function issueTokensForActiveStudentsFromMenu() {
  return TokenService.issueTokensForActiveStudents({});
}

function reissueStudentToken(authToken, rosterKey, options) {
  AdminService.assertAdminAccess(authToken);
  return TokenService.reissueStudentToken(rosterKey, options || {});
}

function revokeStudentToken(authToken, rosterKey) {
  AdminService.assertAdminAccess(authToken);
  return TokenService.revokeStudentToken(rosterKey);
}

function validateStudentToken(token) {
  return TokenService.validateToken(token);
}

function distributeStudentUrlsForCheckedCourses(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return DistributionService.distributeStudentUrlsForCheckedCourses(options || {});
}

function distributeStudentUrlsForCheckedCoursesFromMenu() {
  return DistributionService.distributeStudentUrlsForCheckedCourses({});
}

function getDistributionTargetsPreview(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return DistributionService.getDistributionTargetsPreview(options || {});
}

function dryRunStudentUrlDistribution(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return DistributionService.distributeStudentUrlsForCheckedCourses({
    ...(options || {}),
    dryRun: true
  });
}

function retryFailedStudentUrlDistributions(authToken, options) {
  AdminService.assertAdminAccess(authToken);
  return DistributionService.retryFailedStudentUrlDistributions(options || {});
}

function getDistributionLogs(authToken) {
  AdminService.assertAdminAccess(authToken);
  return SheetRepository.readDistributionLogs();
}

function rebuildAggregateCache(authToken) {
  AdminService.assertAdminAccess(authToken);
  return AggregationService.rebuildAggregateCache();
}

function rebuildAggregateCacheFromMenu() {
  return AggregationService.rebuildAggregateCache();
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

function getAdminDashboardState(authToken) {
  AdminService.assertAdminAccess(authToken);
  SheetRepository.ensureSheets();
  const students = SheetRepository.readStudentRows();
  const summaries = SheetRepository.readAggregateCache();
  return {
    appName: MOL_DRILL_APP_NAME,
    appVersion: MOL_DRILL_APP_VERSION,
    schemaVersion: MOL_DRILL_EXPECTED_SCHEMA_VERSION,
    settings: AdminService.getAdminSettings(authToken),
    courses: SheetRepository.readCourseRows(),
    students,
    tokens: SheetRepository.readTokenRows(),
    summaries,
    progressRows: AggregationService.buildAdminProgressRows(students, summaries),
    distributionPreview: DistributionService.getDistributionTargetsPreview({}),
    distributionLogs: SheetRepository.readDistributionLogs().slice(-50).reverse(),
    answerLogs: SheetRepository.readAnswerLogs().slice(-50).reverse(),
    runLogs: SheetRepository.readRunLogs().slice(-50).reverse(),
    sheetLinks: AdminService.getSheetLinks()
  };
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

function isAnswerCorrect(submitted, expected, tolerance, significantDigits) {
  return MolProblemService.isAnswerCorrect(submitted, expected, tolerance, significantDigits);
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
