import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadApi(extraSandbox = {}) {
  const code = await readFile('Code.gs', 'utf8');
  let uuidCounter = 0;
  const sandbox = {
    console,
    globalThis: {},
    Utilities: {
      getUuid: () => {
        uuidCounter += 1;
        return `uuid-from-test-${uuidCounter}`;
      },
      computeDigest: () => [1, 2, 3, 255],
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    }
  };
  Object.assign(sandbox, extraSandbox);
  vm.runInNewContext(
    `${code}
globalThis.__api = {
  MOL_DRILL_APP_NAME,
  MOL_DRILL_ADMIN_APP_NAME,
  MOL_DRILL_FORMAL_DESCRIPTION,
  SheetRepository,
  AdminService,
  TokenService,
  AdaptiveProblemService: typeof AdaptiveProblemService === 'undefined' ? undefined : AdaptiveProblemService,
  AggregationService,
  ClassroomService,
  DistributionService,
  MolProblemService,
  AnswerService,
  generateProblem,
  generateBeginnerProblem,
  generateIntermediateProblem,
  generateAdvancedProblem,
  normalizeNumericInput,
  roundToSignificantDigits,
  isAnswerCorrect,
  buildExplanation,
  generateSampleProblemsForTest,
  validateProblemGenerationSamplesForTest,
  validateStudentToken,
  getAdminDashboardOverview: typeof getAdminDashboardOverview === 'undefined' ? undefined : getAdminDashboardOverview,
  getAdminLogData: typeof getAdminLogData === 'undefined' ? undefined : getAdminLogData,
  getAdminDistributionPreviewData: typeof getAdminDistributionPreviewData === 'undefined' ? undefined : getAdminDistributionPreviewData,
  getAdminRosterData: typeof getAdminRosterData === 'undefined' ? undefined : getAdminRosterData,
  getAdminDashboardData: typeof getAdminDashboardData === 'undefined' ? undefined : getAdminDashboardData,
  getAdminDashboardState: typeof getAdminDashboardState === 'undefined' ? undefined : getAdminDashboardState,
  molDrillOnOpen: typeof molDrillOnOpen === 'undefined' ? undefined : molDrillOnOpen,
  openAdminDialog: typeof openAdminDialog === 'undefined' ? undefined : openAdminDialog,
  showAdminEntryUrlFromMenu: typeof showAdminEntryUrlFromMenu === 'undefined' ? undefined : showAdminEntryUrlFromMenu,
  doGet: typeof doGet === 'undefined' ? undefined : doGet,
  reinitializeSheets: typeof reinitializeSheets === 'undefined' ? undefined : reinitializeSheets,
  reinitializeSheetsFromMenu: typeof reinitializeSheetsFromMenu === 'undefined' ? undefined : reinitializeSheetsFromMenu,
  initializeTeacherPreviewSession: typeof initializeTeacherPreviewSession === 'undefined' ? undefined : initializeTeacherPreviewSession,
  getTeacherPreviewProblem: typeof getTeacherPreviewProblem === 'undefined' ? undefined : getTeacherPreviewProblem,
  submitTeacherPreviewAnswer: typeof submitTeacherPreviewAnswer === 'undefined' ? undefined : submitTeacherPreviewAnswer,
  buildTeacherStudentPreviewUrl: typeof buildTeacherStudentPreviewUrl === 'undefined' ? undefined : buildTeacherStudentPreviewUrl,
  getStudentAnswerHistory: typeof getStudentAnswerHistory === 'undefined' ? undefined : getStudentAnswerHistory,
  getStudentProblemTypeStats: typeof getStudentProblemTypeStats === 'undefined' ? undefined : getStudentProblemTypeStats
};`,
    sandbox,
    { filename: 'Code.gs' }
  );
  return sandbox.globalThis.__api;
}

async function createManagedSpreadsheetMock(overrides = {}) {
  const { SheetRepository } = await loadApi();
  const sheets = {};
  for (const definition of SheetRepository.getSheetDefinitions()) {
    sheets[definition.name] = [definition.headers.slice()].concat(overrides[definition.name] || []);
  }
  return createSpreadsheetMock(sheets);
}

async function buildManagedRow(sheetName, valuesByHeader = {}) {
  const { SheetRepository } = await loadApi();
  const definition = SheetRepository.getSheetDefinitions().find((item) => item.name === sheetName);
  assert.ok(definition, `${sheetName} definition should exist`);
  return definition.headers.map((header) => valuesByHeader[header] ?? '');
}

async function buildManagedRows(sheetName, rows) {
  const { SheetRepository } = await loadApi();
  const definition = SheetRepository.getSheetDefinitions().find((item) => item.name === sheetName);
  assert.ok(definition, `${sheetName} definition should exist`);
  return rows.map((valuesByHeader) => definition.headers.map((header) => valuesByHeader[header] ?? ''));
}

function extractFunctionBody(source, functionName) {
  const match = new RegExp(`function\\s+${functionName}\\s*\\(`).exec(source);
  assert.ok(match, `${functionName} should be defined`);
  const start = match.index;
  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  assert.fail(`${functionName} body should close`);
}

function createSpreadsheetMock(initialSheets) {
  const rangeCalls = [];
  const setValueCalls = [];
  const setValuesCalls = [];
  const checkboxCalls = [];

  class MockRange {
    constructor(sheet, row, column, numRows, numColumns) {
      this.sheet = sheet;
      this.row = row;
      this.column = column;
      this.numRows = numRows;
      this.numColumns = numColumns;
    }

    getValues() {
      const values = [];
      for (let rowOffset = 0; rowOffset < this.numRows; rowOffset += 1) {
        const source = this.sheet.rows[this.row - 1 + rowOffset] || [];
        const output = [];
        for (let columnOffset = 0; columnOffset < this.numColumns; columnOffset += 1) {
          output.push(source[this.column - 1 + columnOffset] ?? '');
        }
        values.push(output);
      }
      return values;
    }

    setValues(values) {
      setValuesCalls.push({
        sheetName: this.sheet.name,
        row: this.row,
        column: this.column,
        numRows: this.numRows,
        numColumns: this.numColumns,
        values
      });
      values.forEach((sourceRow, rowOffset) => {
        const targetRowIndex = this.row - 1 + rowOffset;
        while (this.sheet.rows.length <= targetRowIndex) {
          this.sheet.rows.push([]);
        }
        for (let columnOffset = 0; columnOffset < this.numColumns; columnOffset += 1) {
          this.sheet.rows[targetRowIndex][this.column - 1 + columnOffset] = sourceRow[columnOffset] ?? '';
        }
      });
      return this;
    }

    setValue(value) {
      setValueCalls.push({
        sheetName: this.sheet.name,
        row: this.row,
        column: this.column,
        value
      });
      while (this.sheet.rows.length < this.row) {
        this.sheet.rows.push([]);
      }
      this.sheet.rows[this.row - 1][this.column - 1] = value;
      return this;
    }

    setFontWeight(_weight) {
      return this;
    }

    setBackground(_color) {
      return this;
    }

    insertCheckboxes() {
      checkboxCalls.push({
        sheetName: this.sheet.name,
        row: this.row,
        column: this.column,
        numRows: this.numRows,
        numColumns: this.numColumns
      });
      return this;
    }

    setDataValidation(_rule) {
      return this;
    }

    clearContent() {
      for (let rowOffset = 0; rowOffset < this.numRows; rowOffset += 1) {
        const target = this.sheet.rows[this.row - 1 + rowOffset] || [];
        for (let columnOffset = 0; columnOffset < this.numColumns; columnOffset += 1) {
          target[this.column - 1 + columnOffset] = '';
        }
      }
      return this;
    }

    createTextFinder(value) {
      return new MockTextFinder(this, value);
    }

    getRow() {
      return this.row;
    }
  }

  class MockTextFinder {
    constructor(range, value) {
      this.range = range;
      this.value = String(value ?? '');
      this.entireCell = false;
      this.caseSensitive = false;
      this.nextIndex = 0;
    }

    matchEntireCell(enabled) {
      this.entireCell = enabled === true;
      return this;
    }

    matchCase(enabled) {
      this.caseSensitive = enabled === true;
      return this;
    }

    findNext() {
      const needle = this.caseSensitive ? this.value : this.value.toLowerCase();
      const cellCount = this.range.numRows * this.range.numColumns;
      for (let cellIndex = this.nextIndex; cellIndex < cellCount; cellIndex += 1) {
        const rowOffset = Math.floor(cellIndex / this.range.numColumns);
        const columnOffset = cellIndex % this.range.numColumns;
        const row = this.range.row + rowOffset;
        const column = this.range.column + columnOffset;
        const raw = this.range.sheet.rows[row - 1]?.[column - 1] ?? '';
        const haystack = this.caseSensitive ? String(raw) : String(raw).toLowerCase();
        const matched = this.entireCell ? haystack === needle : haystack.includes(needle);
        if (matched) {
          this.nextIndex = cellIndex + 1;
          return new MockRange(this.range.sheet, row, column, 1, 1);
        }
      }
      return null;
    }
  }

  class MockSheet {
    constructor(name, rows) {
      this.name = name;
      this.rows = rows.map((row) => row.slice());
    }

    getName() {
      return this.name;
    }

    getLastRow() {
      return this.rows.length;
    }

    getLastColumn() {
      return this.rows.reduce((max, row) => Math.max(max, row.length), 0);
    }

    getMaxRows() {
      return Math.max(this.rows.length, 100);
    }

    clear() {
      this.rows = [];
      return this;
    }

    setFrozenRows(_count) {
      return this;
    }

    setColumnWidth(_column, _width) {
      return this;
    }

    insertRowsAfter(rowIndex, count) {
      const additions = Array.from({ length: count }, () => []);
      this.rows.splice(rowIndex, 0, ...additions);
    }

    getRange(row, column, numRows = 1, numColumns = 1) {
      rangeCalls.push({ sheetName: this.name, row, column, numRows, numColumns });
      return new MockRange(this, row, column, numRows, numColumns);
    }
  }

  const sheets = new Map(Object.entries(initialSheets).map(([name, rows]) => [name, new MockSheet(name, rows)]));
  const insertSheetCalls = [];
  const spreadsheet = {
    getSheetByName(name) {
      return sheets.get(name) || null;
    },

    insertSheet(name) {
      insertSheetCalls.push(name);
      const sheet = new MockSheet(name, []);
      sheets.set(name, sheet);
      return sheet;
    }
  };

  return {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      newDataValidation: () => ({
        requireValueInList: () => ({
          setAllowInvalid: () => ({
            build: () => ({})
          })
        })
      })
    },
    sheets,
    insertSheetCalls,
    rangeCalls,
    checkboxCalls,
    setValueCalls,
    setValuesCalls
  };
}

function createScriptPropertiesMock(initialProperties = {}) {
  const store = { ...initialProperties };
  return {
    store,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => store[key] || '',
        setProperty: (key, value) => {
          store[key] = String(value || '');
        }
      })
    }
  };
}

function createScriptCacheMock() {
  const store = new Map();
  return {
    store,
    CacheService: {
      getScriptCache: () => ({
        get: (key) => store.get(key) || '',
        put: (key, value, _ttlSeconds) => {
          store.set(key, String(value || ''));
        },
        remove: (key) => {
          store.delete(key);
        }
      })
    }
  };
}

function createUiMock() {
  const alerts = [];
  const dialogs = [];
  const menus = [];

  function createMenuMock(caption) {
    const menu = {
      caption,
      items: [],
      addItem(label, functionName) {
        this.items.push({ type: 'item', label, functionName });
        return this;
      },
      addSeparator() {
        this.items.push({ type: 'separator' });
        return this;
      },
      addSubMenu(subMenu) {
        this.items.push({ type: 'submenu', menu: subMenu });
        return this;
      },
      addToUi() {
        menus.push(this);
        return this;
      }
    };
    return menu;
  }

  const ui = {
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
    createMenu: createMenuMock,
    alert(...args) {
      alerts.push(args);
      return this.Button.OK;
    },
    showModalDialog(output, title) {
      dialogs.push({ output, title });
    }
  };
  return { ui, alerts, dialogs, menus };
}

function createHtmlServiceMock() {
  const outputs = [];
  const templates = [];
  return {
    outputs,
    templates,
    HtmlService: {
      SandboxMode: { IFRAME: 'IFRAME' },
      createTemplateFromFile(name) {
        const template = {
          name,
          evaluate() {
            return {
              title: '',
              width: null,
              height: null,
              sandboxMode: '',
              setTitle(title) {
                this.title = title;
                return this;
              },
              setWidth(width) {
                this.width = width;
                return this;
              },
              setHeight(height) {
                this.height = height;
                return this;
              },
              setSandboxMode(mode) {
                this.sandboxMode = mode;
                return this;
              }
            };
          }
        };
        templates.push(template);
        return template;
      },
      createHtmlOutput(html) {
        const output = {
          html,
          width: null,
          height: null,
          setWidth(width) {
            this.width = width;
            return this;
          },
          setHeight(height) {
            this.height = height;
            return this;
          }
        };
        outputs.push(output);
        return output;
      }
    }
  };
}

test('management sheet definitions match the mol drill schema and exclude PDF sheets', async () => {
  const { SheetRepository } = await loadApi();
  const definitions = SheetRepository.getSheetDefinitions();
  const names = definitions.map((definition) => definition.name);

  assert.equal(JSON.stringify(names), JSON.stringify([
    '設定',
    'Classroom一覧',
    '生徒名簿',
    'トークン管理',
    '解答ログ',
    '配付ログ',
    '集計キャッシュ',
    '問題タイプ別キャッシュ',
    '実行ログ'
  ]));
  assert.equal(SheetRepository.getExpectedSchemaVersion(), '17');

  const byName = Object.fromEntries(definitions.map((definition) => [definition.name, definition]));
  assert.equal(JSON.stringify(byName['問題タイプ別キャッシュ'].headers), JSON.stringify([
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
  ]));
  assert.equal(JSON.stringify(byName['実行ログ'].headers), JSON.stringify([
    'runId',
    'operation',
    'startedAt',
    'finishedAt',
    'processedCount',
    'successCount',
    'errorCount',
    'skippedCount',
    'nextAction'
  ]));
  assert.equal(JSON.stringify(byName['トークン管理'].headers), JSON.stringify([
    'token',
    'courseId',
    'courseName',
    'rosterKey',
    'studentId',
    '出席番号',
    '氏名',
    'メール',
    'studentUrl',
    'issuedAt',
    'lastAccessedAt',
    'revoked',
    'note'
  ]));
  for (const header of [
    'beginnerCorrect',
    'beginnerAccuracy',
    'intermediateCorrect',
    'intermediateAccuracy',
    'advancedCorrect',
    'advancedAccuracy',
    'recent10BeginnerAttempts',
    'recent10IntermediateAttempts',
    'recent10AdvancedAttempts',
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
  ]) {
    assert.ok(byName['集計キャッシュ'].headers.includes(header), `${header} should be present`);
  }
  assert.ok(!names.includes('PDF割当'));
  assert.ok(!names.includes('PDF割当下書き'));
  assert.ok(!names.includes('共通添付'));
  assert.ok(!names.includes('Drive保存監査ログ'));
});

test('app display names use molque branding for student and admin surfaces', async () => {
  const { MOL_DRILL_APP_NAME, MOL_DRILL_ADMIN_APP_NAME, MOL_DRILL_FORMAL_DESCRIPTION } = await loadApi();

  assert.equal(MOL_DRILL_APP_NAME, 'もるくえ！');
  assert.equal(MOL_DRILL_ADMIN_APP_NAME, 'もるくえ！ 管理ダッシュボード');
  assert.equal(MOL_DRILL_FORMAL_DESCRIPTION, 'Classroom連携型モル計算練習アプリ');
});

test('default settings include admin and classroom URL delivery controls', async () => {
  const { SheetRepository } = await loadApi();
  const settings = SheetRepository.getDefaultSettingsForTest();
  const keys = settings.map((setting) => setting.key);

  for (const key of ['WEB_APP_URL', 'ADMIN_TOKEN', 'POST_TEXT_TEMPLATE', 'CLASSROOM_SEND_BATCH_SIZE', 'DRY_RUN', 'ENABLE_DISTRIBUTION_LOG', 'ENABLE_ADAPTIVE_PROBLEM_SELECTION']) {
    assert.ok(keys.includes(key), `${key} should be defined`);
  }
  for (const key of [
    'BEGINNER_AVOGADRO_CONSTANT',
    'INTERMEDIATE_AVOGADRO_CONSTANT',
    'ADVANCED_AVOGADRO_CONSTANT',
    'BEGINNER_TOLERANCE',
    'INTERMEDIATE_TOLERANCE',
    'ADVANCED_TOLERANCE'
  ]) {
    assert.ok(keys.includes(key), `${key} should be defined`);
  }
  assert.ok(!keys.includes('AVOGADRO_CONSTANT'));
  assert.ok(!keys.includes('DEFAULT_TOLERANCE'));
  assert.equal(settings.find((setting) => setting.key === 'CLASSROOM_SEND_BATCH_SIZE').value, '40');
  assert.equal(settings.find((setting) => setting.key === 'DRY_RUN').value, 'false');
  assert.equal(settings.find((setting) => setting.key === 'BEGINNER_AVOGADRO_CONSTANT').value, '6.0e23');
  assert.equal(settings.find((setting) => setting.key === 'INTERMEDIATE_AVOGADRO_CONSTANT').value, '6.0e23');
  assert.equal(settings.find((setting) => setting.key === 'ADVANCED_AVOGADRO_CONSTANT').value, '6.02e23');
  assert.equal(settings.find((setting) => setting.key === 'BEGINNER_TOLERANCE').value, '0.01');
  assert.equal(settings.find((setting) => setting.key === 'INTERMEDIATE_TOLERANCE').value, '0.02');
  assert.equal(settings.find((setting) => setting.key === 'ADVANCED_TOLERANCE').value, '0.005');
  assert.doesNotMatch(
    settings.map((setting) => setting.description || '').join('\n'),
    /基礎レベル|標準レベル|発展レベル/
  );
  assert.match(
    settings.map((setting) => setting.description || '').join('\n'),
    /初級レベル[\s\S]*中級レベル[\s\S]*上級レベル/
  );
  assert.match(settings.find((setting) => setting.key === 'POST_TEXT_TEMPLATE').value, /もるくえ！\(モル計算ドリル\)の入場URLです。/);
});

test('problem profiles read level-specific constants from settings when available', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    設定: [
      ['キー', '値', '説明', '更新日時'],
      ['BEGINNER_AVOGADRO_CONSTANT', '6.10e23', '', ''],
      ['INTERMEDIATE_AVOGADRO_CONSTANT', '6.11e23', '', ''],
      ['ADVANCED_AVOGADRO_CONSTANT', '6.12e23', '', ''],
      ['BEGINNER_TOLERANCE', '0.03', '', ''],
      ['INTERMEDIATE_TOLERANCE', '0.04', '', ''],
      ['ADVANCED_TOLERANCE', '0.006', '', '']
    ]
  });
  const { MolProblemService } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });

  const beginner = MolProblemService.generateProblem({ level: 'beginner', problemType: 3 });
  const intermediate = MolProblemService.generateProblem({ level: 'intermediate', problemType: 3 });
  const advanced = MolProblemService.generateProblem({ level: 'advanced', problemType: 3 });

  assert.equal(beginner.avogadroConstant, 6.10e23);
  assert.equal(intermediate.avogadroConstant, 6.11e23);
  assert.equal(advanced.avogadroConstant, 6.12e23);
  assert.equal(beginner.tolerance, 0.03);
  assert.equal(intermediate.tolerance, 0.04);
  assert.equal(advanced.tolerance, 0.006);
});

test('full management sheet reinitialization clears existing sheets without backup copies', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: 'old' },
      { キー: 'WEB_APP_URL', 値: 'https://old.example.com/exec' }
    ]),
    Classroom一覧: await buildManagedRows('Classroom一覧', [
      { courseId: 'course-1', name: '化学A', courseState: 'ACTIVE', 同期対象: true }
    ]),
    生徒名簿: await buildManagedRows('生徒名簿', [
      { courseId: 'course-1', rosterKey: 'course-1::student-1', studentId: 'student-1', 氏名: '山田 太郎', 状態: '在籍' }
    ]),
    トークン管理: await buildManagedRows('トークン管理', [
      { token: 'old-token', rosterKey: 'course-1::student-1', 氏名: '山田 太郎', revoked: false }
    ]),
    解答ログ: await buildManagedRows('解答ログ', [
      { timestamp: '2026-05-21T09:00:00.000Z', attemptId: 'ATT_1', rosterKey: 'course-1::student-1' }
    ]),
    配付ログ: await buildManagedRows('配付ログ', [
      { timestamp: '2026-05-21T10:00:00.000Z', runId: 'DIST_1', status: 'SUCCESS' }
    ]),
    集計キャッシュ: await buildManagedRows('集計キャッシュ', [
      { updatedAt: '2026-05-21T11:00:00.000Z', rosterKey: 'course-1::student-1', totalAttempts: 1 }
    ]),
    実行ログ: await buildManagedRows('実行ログ', [
      { runId: 'RUN_1', operation: 'OLD_OPERATION' }
    ])
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  const definitions = SheetRepository.getSheetDefinitions();

  const result = SheetRepository.reinitializeSheets();

  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, SheetRepository.getExpectedSchemaVersion());
  assert.equal(result.message, '管理シートを全初期化しました。');
  assert.deepEqual(spreadsheetMock.insertSheetCalls, []);
  assert.equal(
    Array.from(spreadsheetMock.sheets.keys()).some((name) => /backup|バックアップ/i.test(name)),
    false
  );

  for (const definition of definitions) {
    const rows = spreadsheetMock.sheets.get(definition.name).rows;
    assert.equal(JSON.stringify(rows[0]), JSON.stringify(definition.headers), `${definition.name} should keep the current headers`);
    if (definition.name !== '設定') {
      assert.equal(rows.length, 1, `${definition.name} should have no data rows after full reinitialization`);
    }
  }

  const settingsRows = spreadsheetMock.sheets.get('設定').rows.slice(1);
  const settingsByKey = Object.fromEntries(settingsRows.map((row) => [row[0], row[1]]));
  assert.equal(settingsByKey.schemaVersion, SheetRepository.getExpectedSchemaVersion());
  assert.equal(settingsByKey.WEB_APP_URL, '');
  assert.match(settingsByKey.ADMIN_TOKEN, /^adm_uuidfromtest/);
});

test('public reinitializeSheets runs without confirmation text', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    Classroom一覧: await buildManagedRows('Classroom一覧', [
      { courseId: 'course-1', name: '化学A', courseState: 'ACTIVE', 同期対象: '1' }
    ])
  });
  const { reinitializeSheets } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });

  const result = reinitializeSheets();

  assert.equal(result.ok, true);
  assert.equal(spreadsheetMock.sheets.get('Classroom一覧').rows.length, 1);
});

test('course sync target column uses 1 or blank while reading legacy TRUE values', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: '17', 説明: 'schema' }
    ]),
    Classroom一覧: await buildManagedRows('Classroom一覧', [
      { courseId: 'course-1', name: '化学A', courseState: 'ACTIVE', 同期対象: '1' },
      { courseId: 'course-2', name: '化学B', courseState: 'ACTIVE', 同期対象: '' },
      { courseId: 'course-3', name: '化学C', courseState: 'ACTIVE', 同期対象: true }
    ])
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });

  const rows = SheetRepository.readCourseRows();

  assert.deepEqual(rows.map((row) => [row.courseId, row.checked]), [
    ['course-1', true],
    ['course-2', false],
    ['course-3', true]
  ]);

  SheetRepository.setCourseSyncSelection(['course-2']);
  const writtenRows = spreadsheetMock.sheets.get('Classroom一覧').rows.slice(1);
  assert.deepEqual(writtenRows.map((row) => row[5]), ['', '1', '']);
});

test('course list writes sync target as 1 or blank and does not add a checkbox to the sync column', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    Classroom一覧: await buildManagedRows('Classroom一覧', [
      { courseId: 'course-1', name: '化学A', courseState: 'ACTIVE', 同期対象: '1' }
    ])
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });

  SheetRepository.ensureSheets();
  SheetRepository.writeCourseListToSheet([
    { courseId: 'course-1', name: '化学A', section: '1組', teacherFolderId: 'folder-1', courseState: 'ACTIVE' },
    { courseId: 'course-2', name: '化学B', section: '2組', teacherFolderId: 'folder-2', courseState: 'ACTIVE' }
  ]);

  const rows = spreadsheetMock.sheets.get('Classroom一覧').rows.slice(1);
  assert.deepEqual(rows.map((row) => row[5]), ['1', '']);
  assert.equal(
    spreadsheetMock.checkboxCalls.some((call) => call.sheetName === 'Classroom一覧' && call.column === 6),
    false
  );
});

test('spreadsheet menu is grouped into submenus without the admin entry URL issuer', async () => {
  const uiMock = createUiMock();
  const { molDrillOnOpen } = await loadApi({
    SpreadsheetApp: {
      getUi: () => uiMock.ui
    }
  });

  molDrillOnOpen();

  assert.equal(uiMock.menus.length, 1);
  const root = uiMock.menus[0];
  assert.equal(root.caption, 'もるくえ！');
  assert.deepEqual(
    root.items.map((item) => item.type === 'submenu' ? `submenu:${item.menu.caption}` : `item:${item.label}`),
    [
      'item:管理ダッシュボードを開く',
      'item:集計キャッシュを更新',
      'submenu:初期設定・同期',
      'submenu:配付',
      'submenu:保守'
    ]
  );
  const serialized = JSON.stringify(root);
  assert.doesNotMatch(serialized, /管理画面URLを発行・表示|showAdminEntryUrlFromMenu/);
  assert.match(serialized, /管理シートを作成・補修/);
  assert.match(serialized, /管理データを全削除して初期状態に戻す/);
});

test('reinitialize menu uses OK_CANCEL alert and cancels without text prompt', async () => {
  const uiMock = createUiMock();
  uiMock.ui.alert = (...args) => {
    uiMock.alerts.push(args);
    if (args[2] === uiMock.ui.ButtonSet.OK_CANCEL) {
      return uiMock.ui.Button.CANCEL;
    }
    return uiMock.ui.Button.OK;
  };
  uiMock.ui.prompt = () => {
    throw new Error('text prompt should not be used for full reinitialization');
  };
  const { reinitializeSheetsFromMenu } = await loadApi({
    SpreadsheetApp: {
      getUi: () => uiMock.ui
    }
  });

  const result = reinitializeSheetsFromMenu();

  assert.equal(result, null);
  assert.equal(uiMock.alerts.length, 1);
  assert.equal(uiMock.alerts[0][0], '管理データを全削除して初期状態に戻す');
  assert.match(uiMock.alerts[0][1], /Classroom一覧/);
  assert.match(uiMock.alerts[0][1], /設定シートの保存内容/);
  assert.match(uiMock.alerts[0][1], /この操作は元に戻せません/);
});

test('setup refuses older schema instead of silently mutating existing management sheets', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: '15' },
      { キー: 'AVOGADRO_CONSTANT', 値: '6.02e23' },
      { キー: 'DEFAULT_TOLERANCE', 値: '0.01' }
    ])
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });

  assert.throws(
    () => SheetRepository.ensureSheets(),
    /管理シートのスキーマが古いです。schemaVersion=15、期待値=17/
  );
});

test('sheet row helpers read update find and append by header after columns are reordered', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['氏名', 'token', 'lastAccessedAt', 'rosterKey'],
      ['山田 太郎', 'tok-1', '', 'course-1::student-1'],
      ['佐藤 花子', 'tok-2', '', 'course-1::student-2']
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};

  assert.equal(JSON.stringify(SheetRepository.readObjectAtRow_('トークン管理', 2)), JSON.stringify({
    氏名: '山田 太郎',
    token: 'tok-1',
    lastAccessedAt: '',
    rosterKey: 'course-1::student-1'
  }));

  assert.equal(SheetRepository.findRowIndexByHeaderValue_('トークン管理', 'token', 'tok-2'), 3);
  assert.equal(SheetRepository.findRowIndexByHeaderValue_('トークン管理', 'token', 'tok'), 0);
  assert.equal(SheetRepository.updateCellByHeader_('トークン管理', 3, 'lastAccessedAt', '2026-05-21T12:00:00.000Z'), true);
  assert.equal(spreadsheetMock.sheets.get('トークン管理').rows[2][2], '2026-05-21T12:00:00.000Z');

  assert.equal(SheetRepository.appendObjectRow_('トークン管理', {
    token: 'tok-3',
    rosterKey: 'course-1::student-3',
    氏名: '鈴木 次郎'
  }), 4);
  assert.equal(JSON.stringify(spreadsheetMock.sheets.get('トークン管理').rows[3]), JSON.stringify([
    '鈴木 次郎',
    'tok-3',
    '',
    'course-1::student-3'
  ]));
});

test('readLatestRowsAsObjects reads only the trailing rows', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    解答ログ: [
      ['timestamp', 'attemptId', 'rosterKey'],
      ['2026-05-21T09:00:00.000Z', 'ATT_1', 'rk-1'],
      ['2026-05-21T09:01:00.000Z', 'ATT_2', 'rk-2'],
      ['2026-05-21T09:02:00.000Z', 'ATT_3', 'rk-3'],
      ['2026-05-21T09:03:00.000Z', 'ATT_4', 'rk-4'],
      ['2026-05-21T09:04:00.000Z', 'ATT_5', 'rk-5']
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};

  const latest = SheetRepository.readLatestRowsAsObjects_('解答ログ', 2);

  assert.deepEqual(latest.map((row) => row.attemptId), ['ATT_4', 'ATT_5']);
  assert.ok(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 5 && call.column === 1 && call.numRows === 2 && call.numColumns === 3
    ),
    'latest row helper should read only the tail range'
  );
  assert.equal(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 2 && call.column === 1 && call.numRows === 5 && call.numColumns === 3
    ),
    false
  );
});

test('admin dashboard overview returns lightweight initial data without log scans or preview targets', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: '17', 説明: 'schema' },
      { キー: 'ADMIN_TOKEN', 値: 'secret', 説明: 'admin token' },
      { キー: 'WEB_APP_URL', 値: 'https://example.com/exec' },
      { キー: 'POST_TEXT_TEMPLATE', 値: 'Hello {{氏名}} {{studentUrl}}' },
      { キー: 'CLASSROOM_SEND_BATCH_SIZE', 値: '20' },
      { キー: 'DRY_RUN', 値: 'false' },
      { キー: 'ENABLE_DISTRIBUTION_LOG', 値: 'true' }
    ]),
    Classroom一覧: await buildManagedRows('Classroom一覧', [
      { courseId: 'course-1', name: '化学A', section: '1組', courseState: 'ACTIVE', 同期対象: true },
      { courseId: 'course-2', name: '化学B', section: '2組', courseState: 'ACTIVE', 同期対象: false }
    ]),
    生徒名簿: await buildManagedRows('生徒名簿', [
      { courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-1', studentId: 'student-1', 出席番号: '7', 氏名: '山田 太郎', メール: 'taro@example.com', 状態: '在籍' },
      { courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-2', studentId: 'student-2', 出席番号: '8', 氏名: '佐藤 花子', メール: 'hanako@example.com', 状態: '退籍' }
    ]),
    トークン管理: await buildManagedRows('トークン管理', [
      { token: 'token-1', courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-1', studentId: 'student-1', 出席番号: '7', 氏名: '山田 太郎', メール: 'taro@example.com', studentUrl: 'https://example.com/exec?t=token-1', issuedAt: '2026-05-20T10:00:00.000Z', lastAccessedAt: '2026-05-20T11:00:00.000Z', revoked: false },
      { token: 'token-2', courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-2', studentId: 'student-2', 出席番号: '8', 氏名: '佐藤 花子', メール: 'hanako@example.com', studentUrl: 'https://example.com/exec?t=token-2', issuedAt: '2026-05-20T10:00:00.000Z', revoked: true }
    ]),
    集計キャッシュ: await buildManagedRows('集計キャッシュ', [
      { updatedAt: '2026-05-21T10:00:00.000Z', courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-1', studentId: 'student-1', 出席番号: '7', 氏名: '山田 太郎', totalAttempts: 10, totalCorrect: 8, totalAccuracy: 0.8, recent10Attempts: 10, recent10Correct: 8, recent10Accuracy: 0.8, beginnerAttempts: 4, beginnerCorrect: 3, intermediateAttempts: 3, intermediateCorrect: 2, advancedAttempts: 3, advancedCorrect: 3, lastAnsweredAt: '2026-05-21T09:59:00.000Z' }
    ]),
    配付ログ: await buildManagedRows('配付ログ', [
      { timestamp: '2026-05-21T09:00:00.000Z', runId: 'RUN_1', courseId: 'course-1', rosterKey: 'course-1::student-1', studentId: 'student-1', token: 'token-1', status: 'SUCCESS' }
    ]),
    実行ログ: await buildManagedRows('実行ログ', [
      { runId: 'RUNLOG_1', operation: 'REBUILD_AGGREGATE_CACHE', startedAt: '2026-05-21T09:00:00.000Z', finishedAt: '2026-05-21T09:01:00.000Z', processedCount: 1, successCount: 1, errorCount: 0, skippedCount: 0, nextAction: 'DONE' }
    ]),
    解答ログ: await buildManagedRows('解答ログ', [
      { timestamp: '2026-05-21T09:00:00.000Z', attemptId: 'ATT_1', rosterKey: 'course-1::student-1' }
    ])
  });
  const { SheetRepository, DistributionService, getAdminDashboardOverview } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used during dashboard overview');
  };
  SheetRepository.readDistributionLogs = () => {
    throw new Error('readDistributionLogs should not be used during dashboard overview');
  };
  SheetRepository.readRunLogs = () => {
    throw new Error('readRunLogs should not be used during dashboard overview');
  };
  DistributionService.getDistributionTargetsPreview = () => {
    throw new Error('distribution preview should not be built during dashboard overview');
  };

  const overview = getAdminDashboardOverview('secret');

  assert.equal(overview.appName, 'もるくえ！');
  assert.equal(overview.schemaVersion, '17');
  assert.equal(overview.courseOverview.totalCount, 2);
  assert.equal(overview.courseOverview.checkedCount, 1);
  assert.equal(overview.studentOverview.activeCount, 1);
  assert.equal(overview.studentOverview.retiredCount, 1);
  assert.equal(overview.tokenOverview.activeCount, 1);
  assert.equal(overview.tokenOverview.revokedCount, 1);
  assert.equal(overview.progressRows.length, 1);
  assert.equal(overview.dashboardMetrics.answeredCount, 1);
  assert.equal(overview.latestRunLog.runId, 'RUNLOG_1');
  assert.equal(Object.hasOwn(overview, 'students'), false);
  assert.equal(Object.hasOwn(overview, 'tokens'), false);
  assert.equal(Object.hasOwn(overview, 'answerLogs'), false);
  assert.equal(Object.hasOwn(overview, 'distributionLogs'), false);
  assert.equal(Object.hasOwn(overview, 'runLogs'), false);
  assert.equal(Object.hasOwn(overview, 'distributionPreview'), false);
});

test('admin log data reads only the latest 50 rows for each log sheet', async () => {
  const logIndexes = Array.from({ length: 60 }, (_, index) => index + 1);
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: '17' },
      { キー: 'ADMIN_TOKEN', 値: 'secret' }
    ]),
    解答ログ: await buildManagedRows('解答ログ', logIndexes.map((index) => ({
      timestamp: `2026-05-21T09:${String(index).padStart(2, '0')}:00.000Z`,
      attemptId: `ATT_${index}`,
      rosterKey: 'course-1::student-1',
      氏名: `生徒${index}`,
      level: 'beginner',
      isCorrect: index % 2 === 0
    }))),
    配付ログ: await buildManagedRows('配付ログ', logIndexes.map((index) => ({
      timestamp: `2026-05-21T10:${String(index).padStart(2, '0')}:00.000Z`,
      runId: `DIST_${index}`,
      courseId: 'course-1',
      rosterKey: `course-1::student-${index}`,
      studentId: `student-${index}`,
      token: `token-${index}`,
      status: index % 2 === 0 ? 'SUCCESS' : 'ERROR',
      errorMessage: index % 2 === 0 ? '' : 'failed'
    }))),
    実行ログ: await buildManagedRows('実行ログ', logIndexes.map((index) => ({
      runId: `RUNLOG_${index}`,
      operation: 'TEST_OPERATION',
      startedAt: `2026-05-21T11:${String(index).padStart(2, '0')}:00.000Z`,
      finishedAt: `2026-05-21T11:${String(index).padStart(2, '0')}:10.000Z`,
      processedCount: index,
      successCount: index - 1,
      errorCount: 1,
      skippedCount: 0,
      nextAction: 'DONE'
    })))
  });
  const { SheetRepository, getAdminLogData } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used for latest admin logs');
  };
  SheetRepository.readDistributionLogs = () => {
    throw new Error('readDistributionLogs should not be used for latest admin logs');
  };
  SheetRepository.readRunLogs = () => {
    throw new Error('readRunLogs should not be used for latest admin logs');
  };

  const logs = getAdminLogData('secret');

  assert.equal(logs.answerLogs.length, 50);
  assert.equal(logs.answerLogs[0].attemptId, 'ATT_60');
  assert.equal(logs.answerLogs[49].attemptId, 'ATT_11');
  assert.equal(logs.distributionLogs.length, 50);
  assert.equal(logs.distributionLogs[0].runId, 'DIST_60');
  assert.equal(logs.runLogs.length, 50);
  assert.equal(logs.runLogs[0].runId, 'RUNLOG_60');
  for (const sheetName of ['解答ログ', '配付ログ', '実行ログ']) {
    assert.ok(
      spreadsheetMock.rangeCalls.some((call) =>
        call.sheetName === sheetName && call.row === 12 && call.column === 1 && call.numRows === 50
      ),
      `${sheetName} should read only the trailing 50 data rows`
    );
    assert.equal(
      spreadsheetMock.rangeCalls.some((call) =>
        call.sheetName === sheetName && call.row === 2 && call.numRows === 60
      ),
      false,
      `${sheetName} should not read the full 60-row log body`
    );
  }
});

test('sheet row helpers fail safely when target rows or values are missing', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'lastAccessedAt'],
      ['tok-1', '']
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};

  assert.equal(SheetRepository.findRowIndexByHeaderValue_('トークン管理', 'token', 'missing-token'), 0);
  assert.equal(SheetRepository.findRowIndexByHeaderValue_('トークン管理', 'missingHeader', 'tok-1'), 0);
  assert.equal(SheetRepository.readObjectAtRow_('トークン管理', 99), null);
  assert.equal(SheetRepository.updateCellByHeader_('トークン管理', 99, 'lastAccessedAt', 'ignored'), false);
  assert.equal(SheetRepository.updateCellByHeader_('トークン管理', 2, 'missingHeader', 'ignored'), false);
  assert.equal(JSON.stringify(SheetRepository.readLatestRowsAsObjects_('トークン管理', 0)), JSON.stringify([]));
});

test('findAnswerLogByAttemptId searches the attemptId column and adopts the matching roster row', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    解答ログ: [
      ['timestamp', 'attemptId', 'rosterKey', 'isCorrect', 'level', 'problemType', 'elapsedMs'],
      ['2026-05-21T09:00:00.000Z', 'ATT_same', 'course-2::student-1', false, 'beginner', 'type-other', 1100],
      ['2026-05-21T09:01:00.000Z', 'ATT_same', 'course-1::student-1', true, 'advanced', 'type-target', 1200],
      ['2026-05-21T09:02:00.000Z', 'ATT_other', 'course-1::student-1', true, 'beginner', 'type-later', 1300]
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used for duplicate lookup');
  };

  const row = SheetRepository.findAnswerLogByAttemptId('course-1::student-1', 'ATT_same');

  assert.equal(row.rosterKey, 'course-1::student-1');
  assert.equal(row.attemptId, 'ATT_same');
  assert.equal(row.isCorrect, true);
  assert.equal(row.level, 'advanced');
  assert.ok(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 2 && call.column === 2 && call.numRows === 3 && call.numColumns === 1
    ),
    'duplicate lookup should search only the attemptId column'
  );
  assert.equal(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 2 && call.column === 1 && call.numRows === 3 && call.numColumns === 7
    ),
    false,
    'duplicate lookup should not read the full answer log body'
  );
});

test('readAnswerLogsForRosterKey searches the rosterKey column and reads only matching rows', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    解答ログ: [
      ['timestamp', 'attemptId', 'rosterKey', 'isCorrect', 'level', 'problemType', 'elapsedMs'],
      ['2026-05-21T09:00:00.000Z', 'ATT_1', 'course-1::student-1', true, 'beginner', 'type-1', 1000],
      ['2026-05-21T09:01:00.000Z', 'ATT_2', 'course-2::student-1', false, 'advanced', 'type-2', 2000],
      ['2026-05-21T09:02:00.000Z', 'ATT_3', 'course-1::student-1', false, 'intermediate', 'type-3', 3000],
      ['2026-05-21T09:03:00.000Z', 'ATT_4', 'course-3::student-1', true, 'beginner', 'type-4', 4000]
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used for student summary lookup');
  };

  const rows = SheetRepository.readAnswerLogsForRosterKey('course-1::student-1');

  assert.equal(JSON.stringify(rows.map((row) => row.attemptId)), JSON.stringify(['ATT_1', 'ATT_3']));
  assert.equal(JSON.stringify(rows.map((row) => row.elapsedMs)), JSON.stringify([1000, 3000]));
  assert.ok(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 2 && call.column === 3 && call.numRows === 4 && call.numColumns === 1
    ),
    'student summary lookup should search only the rosterKey column'
  );
  assert.equal(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 2 && call.column === 1 && call.numRows === 4 && call.numColumns === 7
    ),
    false,
    'student summary lookup should not read the full answer log body'
  );
});

test('upsertAggregateCacheRow updates only the matching cache row by header', async () => {
  const headers = [
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
  ];
  const spreadsheetMock = createSpreadsheetMock({
    集計キャッシュ: [
      headers,
      ['old-other', 'course-1', '化学A', 'course-1::student-2', 'student-2', '8', '佐藤 花子', 4, 2, 0.5, 4, 2, 0.5, 4, 2, 0.5, 0, 0, 0, 0, 0, 0, 4, 0, 0, 'old-other-last', 'beginner', 'type-other', 1000, 1000, 1000, 1000, 900, 900, 1000, 0, 1000],
      ['old-target', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 9, 5, 0.5556, 9, 5, 0.5556, 3, 2, 0.6667, 3, 2, 0.6667, 3, 1, 0.3333, 3, 3, 3, 'old-target-last', 'advanced', 'type-old', 2000, 2000, 2000, 2000, 1800, 1800, 2000, 0, 2000]
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAggregateCache = () => {
    throw new Error('readAggregateCache should not be used for one-row upsert');
  };
  SheetRepository.writeAggregateCache = () => {
    throw new Error('writeAggregateCache should not be used for one-row upsert');
  };

  SheetRepository.upsertAggregateCacheRow({
    updatedAt: 'new-target',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    totalAttempts: 10,
    totalCorrect: 6,
    totalAccuracy: 0.6,
    recent10Attempts: 10,
    recent10Correct: 6,
    recent10Accuracy: 0.6,
    beginnerAttempts: 4,
    beginnerCorrect: 3,
    beginnerAccuracy: 0.75,
    intermediateAttempts: 3,
    intermediateCorrect: 2,
    intermediateAccuracy: 0.6667,
    advancedAttempts: 3,
    advancedCorrect: 1,
    advancedAccuracy: 0.3333,
    recent10BeginnerAttempts: 4,
    recent10IntermediateAttempts: 3,
    recent10AdvancedAttempts: 3,
    lastAnsweredAt: '2026-05-21T09:03:00.000Z',
    lastLevel: 'advanced',
    lastProblemType: 'type-new',
    averageElapsedMs: 2100,
    medianElapsedMs: 2050,
    recent10AverageElapsedMs: 2100,
    recent10MedianElapsedMs: 2050,
    correctAverageElapsedMs: 1900,
    correctRecent10AverageElapsedMs: 1900,
    first10AverageElapsedMs: 2100,
    speedImprovementRate: 0.1234,
    lastElapsedMs: 2200
  });

  assert.equal(spreadsheetMock.sheets.get('集計キャッシュ').rows[1][0], 'old-other');
  assert.equal(spreadsheetMock.sheets.get('集計キャッシュ').rows[2][0], 'new-target');
  assert.equal(spreadsheetMock.sheets.get('集計キャッシュ').rows[2][7], 10);
  assert.deepEqual(spreadsheetMock.setValuesCalls.map((call) => ({
    sheetName: call.sheetName,
    row: call.row,
    column: call.column,
    numRows: call.numRows,
    numColumns: call.numColumns
  })), [
    {
      sheetName: '集計キャッシュ',
      row: 3,
      column: 1,
      numRows: 1,
      numColumns: headers.length
    }
  ]);
});

test('upsertAggregateCacheRow appends one row when the roster cache row is missing', async () => {
  const headers = ['rosterKey', 'totalAttempts', 'totalCorrect', 'totalAccuracy', 'updatedAt', '出席番号', '氏名'];
  const spreadsheetMock = createSpreadsheetMock({
    集計キャッシュ: [
      headers,
      ['course-1::student-2', 4, 2, 0.5, 'old-other', '8', '佐藤 花子']
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAggregateCache = () => {
    throw new Error('readAggregateCache should not be used for append upsert');
  };
  SheetRepository.writeAggregateCache = () => {
    throw new Error('writeAggregateCache should not be used for append upsert');
  };

  SheetRepository.upsertAggregateCacheRow({
    updatedAt: 'new-target',
    rosterKey: 'course-1::student-1',
    number: '7',
    name: '山田 太郎',
    totalAttempts: 1,
    totalCorrect: 1,
    totalAccuracy: 1
  });

  assert.deepEqual(spreadsheetMock.sheets.get('集計キャッシュ').rows[2], [
    'course-1::student-1',
    1,
    1,
    1,
    'new-target',
    '7',
    '山田 太郎'
  ]);
  assert.deepEqual(spreadsheetMock.setValuesCalls.map((call) => ({
    sheetName: call.sheetName,
    row: call.row,
    column: call.column,
    numRows: call.numRows,
    numColumns: call.numColumns
  })), [
    {
      sheetName: '集計キャッシュ',
      row: 3,
      column: 1,
      numRows: 1,
      numColumns: headers.length
    }
  ]);
});

test('upsertProblemTypeStatsRow updates one level and problem type row without rewriting the sheet', async () => {
  const headers = [
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
  ];
  const spreadsheetMock = createSpreadsheetMock({
    問題タイプ別キャッシュ: [
      headers,
      ['old-other', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'beginner', 'type-2', 4, 2, 0.5, 4, 2, 0.5, 1000, 4, 1000, 'old-other-last', false, 900],
      ['old-target', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'beginner', 'type-1', 3, 1, 0.3333, 3, 1, 0.3333, 1200, 3, 1200, 'old-target-last', false, 1100]
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readProblemTypeStatsRows = () => {
    throw new Error('readProblemTypeStatsRows should not be used for one-row upsert');
  };
  SheetRepository.writeProblemTypeStatsRows = () => {
    throw new Error('writeProblemTypeStatsRows should not be used for one-row upsert');
  };

  SheetRepository.upsertProblemTypeStatsRow({
    updatedAt: 'new-target',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    level: 'beginner',
    problemType: 'type-1',
    attempts: 4,
    correct: 2,
    accuracy: 0.5,
    recentAttempts: 4,
    recentCorrect: 2,
    recentAccuracy: 0.5,
    averageElapsedMs: 1300,
    elapsedCount: 4,
    recentAverageElapsedMs: 1300,
    lastAnsweredAt: '2026-05-21T09:03:00.000Z',
    lastIsCorrect: true,
    lastElapsedMs: 2500
  });

  assert.equal(spreadsheetMock.sheets.get('問題タイプ別キャッシュ').rows[1][0], 'old-other');
  assert.equal(spreadsheetMock.sheets.get('問題タイプ別キャッシュ').rows[2][0], 'new-target');
  assert.equal(spreadsheetMock.sheets.get('問題タイプ別キャッシュ').rows[2][headers.indexOf('attempts')], 4);
  assert.deepEqual(spreadsheetMock.setValuesCalls.map((call) => ({
    sheetName: call.sheetName,
    row: call.row,
    column: call.column,
    numRows: call.numRows,
    numColumns: call.numColumns
  })), [
    {
      sheetName: '問題タイプ別キャッシュ',
      row: 3,
      column: 1,
      numRows: 1,
      numColumns: headers.length
    }
  ]);
});

test('management schema assertion is cached within one execution and resettable', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token'],
      ['tok-1']
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  let statusCalls = 0;
  SheetRepository.getSchemaStatus = () => {
    statusCalls += 1;
    return {
      ok: true,
      expectedSchemaVersion: '17',
      schemaVersion: '17',
      missingSheets: [],
      missingHeadersBySheet: []
    };
  };

  SheetRepository.getManagedSheet_('トークン管理');
  SheetRepository.getManagedSheet_('トークン管理');
  assert.equal(statusCalls, 1);

  SheetRepository.resetExecutionCaches_();
  SheetRepository.getManagedSheet_('トークン管理');
  assert.equal(statusCalls, 2);
});

test('admin action lock uses script lock and reports contention', async () => {
  let releaseCount = 0;
  const acquired = await loadApi({
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {
          releaseCount += 1;
        }
      })
    }
  });

  const result = acquired.AdminService.withAdminActionLock('unit-test', () => 'locked-result');
  assert.equal(result, 'locked-result');
  assert.equal(releaseCount, 1);

  const denied = await loadApi({
    LockService: {
      getScriptLock: () => ({
        tryLock: () => false,
        releaseLock: () => {
          releaseCount += 1;
        }
      })
    }
  });

  assert.throws(
    () => denied.AdminService.withAdminActionLock('unit-test', () => 'should-not-run'),
    /別の処理が実行中です。少し待ってから再実行してください。/
  );
});

test('dangerous admin entrypoints acquire admin action lock', async () => {
  const code = await readFile('Code.gs', 'utf8');

  for (const functionName of [
    'refreshStudentsForCheckedCourses',
    'issueTokensForCheckedCourses',
    'issueTokensForActiveStudents',
    'reissueStudentToken',
    'revokeStudentToken',
    'distributeStudentUrlsForCheckedCourses',
    'dryRunStudentUrlDistribution',
    'retryFailedStudentUrlDistributions'
  ]) {
    assert.match(
      extractFunctionBody(code, functionName),
      /AdminService\.withAdminActionLock\(/,
      `${functionName} should use the admin action lock`
    );
  }

  assert.match(
    code,
    /static saveCourseSyncSelection\(authToken, selectedCourseIds\) \{[\s\S]*?withAdminActionLock\(/,
    'saveCourseSyncSelection should use the admin action lock'
  );
});

test('admin service recognizes admin routes and normalizes editable settings', async () => {
  const { AdminService } = await loadApi();

  assert.equal(AdminService.isAdminRoute({ parameter: { admin: 'secret' } }), true);
  assert.equal(AdminService.isAdminRoute({ parameter: { page: 'admin' } }), true);
  assert.equal(AdminService.isAdminRoute({ parameter: { t: 'student-token' } }), false);

  const settings = AdminService.normalizeSettingsPayload({
    webAppUrl: ' https://example.com/exec ',
    adminToken: ' new-secret ',
    postTextTemplate: ' Hello {{氏名}} {{studentUrl}} ',
    dryRun: true,
    batchSize: '999',
    enableDistributionLog: false,
    adaptiveProblemSelection: false,
    beginnerAvogadroConstant: '6.10e23',
    intermediateAvogadroConstant: '6.11e23',
    advancedAvogadroConstant: '6.12e23',
    beginnerTolerance: '0.03',
    intermediateTolerance: '0.04',
    advancedTolerance: '0.006'
  });

  assert.equal(settings.webAppUrl, 'https://example.com/exec');
  assert.equal(settings.adminToken, 'new-secret');
  assert.equal(settings.postTextTemplate, 'Hello {{氏名}} {{studentUrl}}');
  assert.equal(settings.dryRun, true);
  assert.equal(settings.batchSize, 100);
  assert.equal(settings.enableDistributionLog, false);
  assert.equal(settings.adaptiveProblemSelection, false);
  assert.equal(settings.beginnerAvogadroConstant, 6.10e23);
  assert.equal(settings.intermediateAvogadroConstant, 6.11e23);
  assert.equal(settings.advancedAvogadroConstant, 6.12e23);
  assert.equal(settings.beginnerTolerance, 0.03);
  assert.equal(settings.intermediateTolerance, 0.04);
  assert.equal(settings.advancedTolerance, 0.006);
});

test('admin dashboard opens from the spreadsheet menu and injects the internal auth token without URL issuance', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'WEB_APP_URL', 値: '' },
      { キー: 'ADMIN_TOKEN', 値: '' }
    ])
  });
  const scriptPropertiesMock = createScriptPropertiesMock();
  const uiMock = createUiMock();
  const htmlServiceMock = createHtmlServiceMock();
  const { openAdminDialog, showAdminEntryUrlFromMenu } = await loadApi({
    SpreadsheetApp: {
      ...spreadsheetMock.SpreadsheetApp,
      getUi: () => uiMock.ui
    },
    PropertiesService: scriptPropertiesMock.PropertiesService,
    HtmlService: htmlServiceMock.HtmlService,
    ScriptApp: { getService: () => ({ getUrl: () => '' }) }
  });

  openAdminDialog();

  assert.equal(showAdminEntryUrlFromMenu, undefined);
  assert.equal(scriptPropertiesMock.store.MOL_DRILL_ADMIN_TOKEN, 'adm_uuidfromtest1');
  const settingsByKey = Object.fromEntries(spreadsheetMock.sheets.get('設定').rows.slice(1).map((row) => [row[0], row[1]]));
  assert.equal(settingsByKey.ADMIN_TOKEN, 'adm_uuidfromtest1');
  assert.equal(uiMock.alerts.length, 0, 'dashboard open should not show alerts');
  assert.equal(uiMock.dialogs.length, 1);
  assert.equal(uiMock.dialogs[0].title, 'もるくえ！ 管理ダッシュボード');
  assert.equal(htmlServiceMock.templates[0].name, 'Admin');
  assert.equal(htmlServiceMock.templates[0].initialAdminToken, 'adm_uuidfromtest1');
});

test('student answer history requires admin access and returns latest rows for one roster only', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: '17' },
      { キー: 'ADMIN_TOKEN', 値: 'secret' }
    ]),
    解答ログ: await buildManagedRows('解答ログ', [
      {
        timestamp: '2026-05-21T09:00:00.000Z',
        attemptId: 'ATT_1',
        courseName: '化学A',
        rosterKey: 'course-1::student-1',
        出席番号: '7',
        氏名: '山田 太郎',
        level: 'beginner',
        problemType: 'mol_to_mass',
        questionText: 'H2 1 mol は何 g ですか。',
        expectedAnswer: '2',
        submittedAnswer: '2',
        normalizedSubmittedAnswer: '2',
        unit: 'g',
        isCorrect: true,
        explanation: 'H2 のモル質量は 2 g/mol です。',
        elapsedMs: 12000
      },
      {
        timestamp: '2026-05-21T09:01:00.000Z',
        attemptId: 'ATT_OTHER',
        courseName: '化学A',
        rosterKey: 'course-1::student-2',
        氏名: '佐藤 花子',
        level: 'beginner',
        problemType: 'mass_to_mol',
        questionText: 'O2 32 g は何 mol ですか。',
        expectedAnswer: '1',
        submittedAnswer: '2',
        isCorrect: false
      },
      {
        timestamp: '2026-05-21T09:02:00.000Z',
        attemptId: 'ATT_2',
        courseName: '化学A',
        rosterKey: 'course-1::student-1',
        出席番号: '7',
        氏名: '山田 太郎',
        level: 'intermediate',
        problemType: 'mass_to_mol',
        questionText: 'CO2 44 g は何 mol ですか。',
        expectedAnswer: '1',
        submittedAnswer: '0.5',
        normalizedSubmittedAnswer: '0.5',
        unit: 'mol',
        isCorrect: false,
        explanation: '質量をモル質量で割ります。',
        elapsedMs: 21000
      },
      {
        timestamp: '2026-05-21T09:03:00.000Z',
        attemptId: 'ATT_3',
        courseName: '化学A',
        rosterKey: 'course-1::student-1',
        出席番号: '7',
        氏名: '山田 太郎',
        level: 'advanced',
        problemType: 'mol_to_particles',
        questionText: 'H2O 2 mol は何個ですか。',
        expectedAnswer: '1.2e24',
        submittedAnswer: '1.2e24',
        normalizedSubmittedAnswer: '1.2e24',
        unit: '個',
        isCorrect: true,
        explanation: 'mol にアボガドロ定数を掛けます。',
        elapsedMs: 18000
      }
    ])
  });
  const { getStudentAnswerHistory, SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.readAnswerLogs = () => {
    throw new Error('getStudentAnswerHistory should not scan all answer logs');
  };

  const history = getStudentAnswerHistory('secret', 'course-1::student-1', 2);

  assert.equal(history.length, 2);
  assert.equal(JSON.stringify(history.map((row) => row.attemptId)), JSON.stringify(['ATT_3', 'ATT_2']));
  assert.equal(history[0].courseName, '化学A');
  assert.equal(history[0].number, '7');
  assert.equal(history[0].name, '山田 太郎');
  assert.equal(history[0].problemType, 'mol_to_particles');
  assert.equal(history[0].submittedAnswer, '1.2e24');
  assert.equal(history[0].normalizedSubmittedAnswer, '1.2e24');
  assert.equal(history[0].isCorrect, true);
  assert.equal(history[0].elapsedMs, 18000);
  assert.match(history[0].questionHtml, /H<sub>2<\/sub>O/);
  assert.equal(history.some((row) => row.rosterKey === 'course-1::student-2'), false);
  assert.throws(
    () => getStudentAnswerHistory('wrong-secret', 'course-1::student-1', 2),
    /管理ダッシュボードの内部認証が一致しません/
  );
});

test('student problem type stats requires admin access and returns only one roster from the cache', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'schemaVersion', 値: '17' },
      { キー: 'ADMIN_TOKEN', 値: 'secret' }
    ]),
    問題タイプ別キャッシュ: await buildManagedRows('問題タイプ別キャッシュ', [
      {
        updatedAt: '2026-05-21T09:00:00.000Z',
        courseName: '化学A',
        rosterKey: 'course-1::student-1',
        出席番号: '7',
        氏名: '山田 太郎',
        level: 'beginner',
        problemType: 'mol_to_mass',
        attempts: 5,
        correct: 2,
        accuracy: 0.4,
        recentAttempts: 5,
        recentCorrect: 2,
        recentAccuracy: 0.4,
        averageElapsedMs: 3000,
        elapsedCount: 5,
        recentAverageElapsedMs: 3200,
        lastAnsweredAt: '2026-05-21T09:10:00.000Z',
        lastIsCorrect: false,
        lastElapsedMs: 3400
      },
      {
        updatedAt: '2026-05-21T09:01:00.000Z',
        courseName: '化学A',
        rosterKey: 'course-1::student-2',
        氏名: '佐藤 花子',
        level: 'beginner',
        problemType: 'mass_to_mol',
        attempts: 4,
        correct: 4,
        accuracy: 1
      },
      {
        updatedAt: '2026-05-21T09:02:00.000Z',
        courseName: '化学A',
        rosterKey: 'course-1::student-1',
        出席番号: '7',
        氏名: '山田 太郎',
        level: 'beginner',
        problemType: 'mol_to_particles',
        attempts: 4,
        correct: 4,
        accuracy: 1,
        recentAttempts: 4,
        recentCorrect: 4,
        recentAccuracy: 1,
        averageElapsedMs: 7000,
        elapsedCount: 4,
        recentAverageElapsedMs: 7500
      }
    ])
  });
  const { getStudentProblemTypeStats, SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.readProblemTypeStatsRows = () => {
    throw new Error('getStudentProblemTypeStats should not read the full problem type stats cache');
  };

  const rows = getStudentProblemTypeStats('secret', 'course-1::student-1');

  assert.equal(rows.length, 2);
  assert.equal(JSON.stringify(rows.map((row) => row.problemType)), JSON.stringify(['mol_to_mass', 'mol_to_particles']));
  assert.equal(rows[0].attempts, 5);
  assert.equal(rows[0].correct, 2);
  assert.equal(rows[0].accuracy, 0.4);
  assert.equal(rows[0].recentAccuracy, 0.4);
  assert.equal(rows[0].averageElapsedMs, 3000);
  assert.equal(rows[0].recentAverageElapsedMs, 3200);
  assert.equal(rows.some((row) => row.rosterKey === 'course-1::student-2'), false);
  assert.equal(getStudentProblemTypeStats('secret', 'course-1::student-missing').length, 0);
  assert.throws(
    () => getStudentProblemTypeStats('', 'course-1::student-1'),
    /管理ダッシュボードの内部認証が一致しません/
  );
  assert.throws(
    () => getStudentProblemTypeStats('wrong-secret', 'course-1::student-1'),
    /管理ダッシュボードの内部認証が一致しません/
  );
});

test('teacher preview URL builder requires admin access and protects preview with a short-lived nonce', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'WEB_APP_URL', 値: 'https://example.com/exec' },
      { キー: 'ADMIN_TOKEN', 値: 'admin-secret' }
    ])
  });
  const cacheMock = createScriptCacheMock();
  const { buildTeacherStudentPreviewUrl } = await loadApi({
    SpreadsheetApp: spreadsheetMock.SpreadsheetApp,
    PropertiesService: createScriptPropertiesMock({ MOL_DRILL_ADMIN_TOKEN: 'admin-secret' }).PropertiesService,
    CacheService: cacheMock.CacheService
  });

  const previewUrl = buildTeacherStudentPreviewUrl('admin-secret', 'student token/1');
  const parsed = new URL(previewUrl);

  assert.equal(parsed.origin + parsed.pathname, 'https://example.com/exec');
  assert.equal(parsed.searchParams.get('preview'), 'teacher');
  assert.equal(parsed.searchParams.get('t'), 'student token/1');
  assert.equal(parsed.searchParams.has('admin'), false);
  assert.match(parsed.searchParams.get('previewNonce') || '', /^tp_/);
  const cachedPayload = JSON.parse(cacheMock.store.get(`teacherPreviewNonce:${parsed.searchParams.get('previewNonce')}`));
  assert.equal(cachedPayload.authToken, 'admin-secret');
  assert.throws(
    () => buildTeacherStudentPreviewUrl('wrong-secret', 'student-token'),
    /管理ダッシュボードの内部認証が一致しません/
  );
});

test('doGet routes valid teacher preview to Student template and rejects invalid admin tokens', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'ADMIN_TOKEN', 値: 'admin-secret' }
    ])
  });
  const templates = [];
  const outputs = [];
  const htmlService = {
    SandboxMode: { IFRAME: 'IFRAME' },
    createTemplateFromFile(name) {
      const template = {
        name,
        initialToken: undefined,
        initialAdminToken: undefined,
        initialTeacherPreview: undefined,
        evaluate() {
          templates.push(this);
          return {
            title: '',
            sandboxMode: '',
            setTitle(title) {
              this.title = title;
              return this;
            },
            setSandboxMode(mode) {
              this.sandboxMode = mode;
              return this;
            }
          };
        }
      };
      return template;
    },
    createHtmlOutput(html) {
      const output = {
        html,
        title: '',
        setTitle(title) {
          this.title = title;
          return this;
        }
      };
      outputs.push(output);
      return output;
    }
  };
  const cacheMock = createScriptCacheMock();
  const nonce = 'tp_test_nonce';
  cacheMock.store.set(`teacherPreviewNonce:${nonce}`, JSON.stringify({ authToken: 'admin-secret' }));
  const { doGet } = await loadApi({
    SpreadsheetApp: spreadsheetMock.SpreadsheetApp,
    PropertiesService: createScriptPropertiesMock({ MOL_DRILL_ADMIN_TOKEN: 'admin-secret' }).PropertiesService,
    HtmlService: htmlService,
    CacheService: cacheMock.CacheService
  });

  const response = doGet({ parameter: { teacherPreview: '1', previewNonce: nonce, t: 'student-token' } });

  assert.equal(response.title, 'もるくえ！');
  assert.equal(templates.length, 1);
  assert.equal(templates[0].name, 'Student');
  assert.equal(templates[0].initialToken, 'student-token');
  assert.equal(templates[0].initialAdminToken, 'admin-secret');
  assert.equal(templates[0].initialTeacherPreview, true);

  const denied = doGet({ parameter: { teacherPreview: '1', previewNonce: 'tp_wrong' } });
  assert.equal(denied.title, '教師プレビューアクセス不可');
  assert.match(denied.html, /教師プレビューを開けません/);

  const deniedAdminFallback = doGet({ parameter: { teacherPreview: '1', admin: 'admin-secret', t: 'student-token' } });
  assert.equal(deniedAdminFallback.title, '教師プレビューアクセス不可');
  assert.match(deniedAdminFallback.html, /一時認証|教師プレビューを開けません/);
});

test('admin entry URL menu function is not exposed because the dashboard opens from the spreadsheet menu', async () => {
  const spreadsheetMock = await createManagedSpreadsheetMock({
    設定: await buildManagedRows('設定', [
      { キー: 'WEB_APP_URL', 値: '' },
      { キー: 'ADMIN_TOKEN', 値: '' }
    ])
  });
  const scriptPropertiesMock = createScriptPropertiesMock();
  const uiMock = createUiMock();
  const htmlServiceMock = createHtmlServiceMock();
  const { showAdminEntryUrlFromMenu } = await loadApi({
    SpreadsheetApp: {
      ...spreadsheetMock.SpreadsheetApp,
      getUi: () => uiMock.ui
    },
    PropertiesService: scriptPropertiesMock.PropertiesService,
    HtmlService: htmlServiceMock.HtmlService,
    console: { error: () => {} },
    ScriptApp: {
      getService: () => ({
        getUrl: () => ''
      })
    }
  });

  assert.equal(showAdminEntryUrlFromMenu, undefined);
  assert.equal(uiMock.alerts.length, 0);
  assert.equal(htmlServiceMock.outputs.length, 0);
});

test('course sync selection updates only active known classroom rows', async () => {
  const { AdminService } = await loadApi();
  const rows = [
    { courseId: 'course-1', name: '化学A', courseState: 'ACTIVE', checked: false },
    { courseId: 'course-2', name: '化学B', courseState: 'ACTIVE', checked: true },
    { courseId: 'course-3', name: '終了', courseState: 'ARCHIVED', checked: true }
  ];

  const next = AdminService.applyCourseSelection(rows, ['course-1', 'course-3', 'missing']);

  assert.equal(next.find((row) => row.courseId === 'course-1').checked, true);
  assert.equal(next.find((row) => row.courseId === 'course-2').checked, false);
  assert.equal(next.find((row) => row.courseId === 'course-3').checked, false);
});

test('token rows use courseId::studentId roster keys and preserve active existing tokens', async () => {
  const { TokenService } = await loadApi();
  const students = [
    {
      courseId: 'course-1',
      courseName: '化学A',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      email: 'taro@example.com',
      status: '在籍'
    },
    {
      courseId: 'course-1',
      courseName: '化学A',
      studentId: 'student-2',
      number: '8',
      name: '佐藤 花子',
      email: 'hanako@example.com',
      status: '退籍'
    }
  ];
  const existing = [
    {
      token: 'existing-token',
      rosterKey: 'course-1::student-1',
      studentUrl: 'https://script.google.com/macros/s/old/exec?t=existing-token',
      revoked: false,
      issuedAt: '2026-05-20T10:00:00.000Z',
      lastAccessedAt: '2026-05-20T10:30:00.000Z',
      note: 'keep'
    }
  ];

  const rows = TokenService.buildTokenRowsForStudents(
    students,
    existing,
    'https://script.google.com/macros/s/deploy/exec',
    '2026-05-20T12:00:00.000Z',
    () => 'new-token'
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rosterKey, 'course-1::student-1');
  assert.equal(rows[0].token, 'existing-token');
  assert.equal(rows[0].studentUrl, 'https://script.google.com/macros/s/deploy/exec?t=existing-token');
  assert.equal(rows[0].issuedAt, '2026-05-20T10:00:00.000Z');
  assert.equal(rows[0].lastAccessedAt, '2026-05-20T10:30:00.000Z');
  assert.equal(rows[0].revoked, false);
});

test('token rows can be reissued and revoked for a roster key', async () => {
  const { TokenService } = await loadApi();
  const rows = [
    {
      token: 'old-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      email: 'taro@example.com',
      studentUrl: 'https://example.com/exec?t=old-token',
      issuedAt: '2026-05-20T10:00:00.000Z',
      revoked: false,
      note: ''
    }
  ];

  const reissued = TokenService.reissueTokenRowsForRosterKey(
    rows,
    'course-1::student-1',
    'https://example.com/exec',
    '2026-05-20T12:00:00.000Z',
    () => 'new-token'
  );
  assert.equal(reissued.updated.token, 'new-token');
  assert.equal(reissued.updated.studentUrl, 'https://example.com/exec?t=new-token');
  assert.equal(reissued.updated.revoked, false);
  assert.match(reissued.updated.note, /再発行/);

  const revoked = TokenService.revokeTokenRowsForRosterKey(
    reissued.rows,
    'course-1::student-1',
    '2026-05-20T13:00:00.000Z'
  );
  assert.equal(revoked.updated.revoked, true);
  assert.match(revoked.updated.note, /無効化/);
});

test('token validation rejects empty missing and revoked tokens', async () => {
  const { TokenService } = await loadApi();
  const rows = [
    {
      token: 'active-token',
      rosterKey: 'course-1::student-1',
      courseId: 'course-1',
      studentId: 'student-1',
      name: '山田 太郎',
      revoked: false
    },
    {
      token: 'revoked-token',
      rosterKey: 'course-1::student-2',
      courseId: 'course-1',
      studentId: 'student-2',
      name: '佐藤 花子',
      revoked: true
    }
  ];

  assert.equal(TokenService.validateTokenAgainstRows('active-token', rows).rosterKey, 'course-1::student-1');
  assert.throws(() => TokenService.validateTokenAgainstRows('', rows), /tokenが空/);
  assert.throws(() => TokenService.validateTokenAgainstRows('missing-token', rows), /tokenが見つかりません/);
  assert.throws(() => TokenService.validateTokenAgainstRows('revoked-token', rows), /無効化/);
});

test('token validation finds only the matching token row with TextFinder', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['rosterKey', 'revoked', 'token', 'courseId', 'courseName', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'note'],
      ['course-1::student-1', false, 'active-token', 'course-1', '化学A', 'student-1', '7', '山田 太郎', 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', ''],
      ['course-1::student-2', true, 'revoked-token', 'course-1', '化学A', 'student-2', '8', '佐藤 花子', 'b@example.com', 'https://example.com?t=revoked-token', '2026-05-20T12:00:00.000Z', '', '']
    ]
  });
  const { SheetRepository, TokenService } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readTokenRows = () => {
    throw new Error('readTokenRows should not be used for token validation');
  };

  const tokenRow = TokenService.validateToken('active-token');

  assert.equal(tokenRow.rosterKey, 'course-1::student-1');
  assert.equal(tokenRow.name, '山田 太郎');
  assert.throws(() => TokenService.validateToken('missing-token'), /tokenが見つかりません/);
  assert.throws(() => TokenService.validateToken('revoked-token'), /無効化/);
  assert.throws(() => TokenService.validateToken(''), /tokenが空/);
  assert.ok(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === 'トークン管理' && call.row === 2 && call.column === 3 && call.numRows === 2 && call.numColumns === 1
    ),
    'token validation should search only the token column'
  );
  assert.ok(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === 'トークン管理' && call.row === 2 && call.column === 1 && call.numRows === 1 && call.numColumns === 13
    ),
    'token validation should fetch only the matched token row after TextFinder resolves it'
  );
  assert.equal(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === 'トークン管理' && call.row === 2 && call.column === 1 && call.numRows === 2 && call.numColumns === 13
    ),
    false,
    'token validation should not read the whole token table body'
  );
});

test('recordTokenAccess updates only lastAccessedAt for the matching token row', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['氏名', 'token', 'lastAccessedAt', 'rosterKey', 'revoked'],
      ['山田 太郎', 'active-token', '', 'course-1::student-1', false],
      ['佐藤 花子', 'other-token', '', 'course-1::student-2', false]
    ]
  });
  const { SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readTokenRows = () => {
    throw new Error('readTokenRows should not be used for access recording');
  };
  SheetRepository.writeTokenRows = () => {
    throw new Error('writeTokenRows should not be used for access recording');
  };

  const updated = SheetRepository.recordTokenAccess('other-token', '2026-05-21T12:00:00.000Z');

  assert.equal(updated.rosterKey, 'course-1::student-2');
  assert.equal(updated.lastAccessedAt, '2026-05-21T12:00:00.000Z');
  assert.deepEqual(spreadsheetMock.setValueCalls, [
    {
      sheetName: 'トークン管理',
      row: 3,
      column: 3,
      value: '2026-05-21T12:00:00.000Z'
    }
  ]);
  assert.equal(spreadsheetMock.setValuesCalls.length, 0);
  assert.throws(() => SheetRepository.recordTokenAccess('missing-token', '2026-05-21T12:00:00.000Z'), /見つかりません/);
  assert.throws(() => SheetRepository.recordTokenAccess('', '2026-05-21T12:00:00.000Z'), /tokenが空/);
});

test('student access recording is throttled and tolerates unavailable CacheService', async () => {
  const cache = new Map();
  const putCalls = [];
  const { AnswerService, SheetRepository } = await loadApi({
    SpreadsheetApp: {},
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) || '',
        put: (key, value, ttlSeconds) => {
          cache.set(key, value);
          putCalls.push({ key, value, ttlSeconds });
        }
      })
    }
  });
  const tokenRow = {
    token: 'active-token',
    rosterKey: 'course-1::student-1'
  };
  const updates = [];
  SheetRepository.withDocumentLock = (callback) => callback();
  SheetRepository.recordTokenAccess = (token, accessedAt) => {
    updates.push({ token, accessedAt });
  };

  AnswerService.recordStudentAccess_(tokenRow);
  AnswerService.recordStudentAccess_(tokenRow);
  AnswerService.recordStudentAccess_({ token: '', rosterKey: 'missing-token' });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].token, 'active-token');
  assert.equal(putCalls.length, 1);
  assert.equal(putCalls[0].ttlSeconds, 600);

  const unavailable = await loadApi({
    SpreadsheetApp: {},
    CacheService: {
      getScriptCache: () => {
        throw new Error('cache unavailable');
      }
    }
  });
  let fallbackUpdates = 0;
  unavailable.SheetRepository.withDocumentLock = (callback) => callback();
  unavailable.SheetRepository.recordTokenAccess = () => {
    fallbackUpdates += 1;
  };

  unavailable.AnswerService.recordStudentAccess_(tokenRow);

  assert.equal(fallbackUpdates, 1);
});

test('classroom distribution target builder skips sent rows and supports failed-only retry', async () => {
  const { DistributionService } = await loadApi();
  const tokenRows = [
    {
      token: 'sent-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      name: '送信済み',
      studentUrl: 'https://example.com/exec?t=sent-token',
      revoked: false
    },
    {
      token: 'failed-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-2',
      studentId: 'student-2',
      name: '失敗',
      studentUrl: 'https://example.com/exec?t=failed-token',
      revoked: false
    },
    {
      token: 'new-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-3',
      studentId: 'student-3',
      name: '未配付',
      studentUrl: 'https://example.com/exec?t=new-token',
      revoked: false
    },
    {
      token: 'other-course-token',
      courseId: 'course-2',
      courseName: '化学B',
      rosterKey: 'course-2::student-4',
      studentId: 'student-4',
      name: '別クラス',
      studentUrl: 'https://example.com/exec?t=other-course-token',
      revoked: false
    }
  ];
  const logRows = [
    { token: 'sent-token', rosterKey: 'course-1::student-1', status: 'SUCCESS', classroomAnnouncementId: 'ann-1' },
    { token: 'failed-token', rosterKey: 'course-1::student-2', status: 'ERROR', errorMessage: 'quota' }
  ];

  const normalTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    courseId: 'course-1',
    batchSize: 10
  });
  assert.equal(JSON.stringify(normalTargets.map((row) => row.token)), JSON.stringify(['failed-token', 'new-token']));

  const retryTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    courseId: 'course-1',
    retryFailedOnly: true,
    batchSize: 10
  });
  assert.equal(JSON.stringify(retryTargets.map((row) => row.token)), JSON.stringify(['failed-token']));

  const limitedTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    courseId: 'course-1',
    batchSize: 1
  });
  assert.equal(JSON.stringify(limitedTargets.map((row) => row.token)), JSON.stringify(['failed-token']));
});

test('classroom distribution target builder supports explicit student, token, and force redistribution scopes', async () => {
  const { DistributionService } = await loadApi();
  const tokenRows = [
    {
      token: 'sent-token-v2',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      name: '再発行済み',
      studentUrl: 'https://example.com/exec?t=sent-token-v2',
      revoked: false
    },
    {
      token: 'failed-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-2',
      studentId: 'student-2',
      name: '失敗',
      studentUrl: 'https://example.com/exec?t=failed-token',
      revoked: false
    },
    {
      token: 'new-token',
      courseId: 'course-2',
      courseName: '化学B',
      rosterKey: 'course-2::student-3',
      studentId: 'student-3',
      name: '未配付',
      studentUrl: 'https://example.com/exec?t=new-token',
      revoked: false
    }
  ];
  const logRows = [
    { token: 'sent-token-v1', rosterKey: 'course-1::student-1', status: 'SUCCESS', classroomAnnouncementId: 'ann-1' },
    { token: 'failed-token', rosterKey: 'course-1::student-2', status: 'ERROR', errorMessage: 'quota' }
  ];

  const rosterTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    rosterKeys: ['course-1::student-1', 'course-2::student-3'],
    batchSize: 10
  });
  assert.equal(JSON.stringify(rosterTargets.map((row) => row.token)), JSON.stringify(['new-token']));

  const forceTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    rosterKey: 'course-1::student-1',
    forceRedistribute: true,
    batchSize: 10
  });
  assert.equal(JSON.stringify(forceTargets.map((row) => row.token)), JSON.stringify(['sent-token-v2']));

  const tokenTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    tokens: ['failed-token', 'new-token'],
    batchSize: 10
  });
  assert.equal(JSON.stringify(tokenTargets.map((row) => row.token)), JSON.stringify(['failed-token', 'new-token']));

  const emptyRosterTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    rosterKeys: [],
    batchSize: 10
  });
  assert.equal(emptyRosterTargets.length, 0);

  assert.throws(
    () => DistributionService.buildDistributionTargets(tokenRows, logRows, {
      forceRedistribute: true,
      batchSize: 10
    }),
    /強制再配付は対象Classroomまたは対象生徒を指定してください。/
  );

  assert.throws(
    () => DistributionService.buildDistributionTargets(tokenRows, logRows, {
      rosterKey: 'course-1::student-1',
      forceRedistribute: true,
      retryFailedOnly: true,
      batchSize: 10
    }),
    /失敗分再送と強制再配付は同時に指定できません。/
  );
});

test('classroom distribution preview returns normalized scope options and supports roster-only force preview', async () => {
  const { DistributionService, SheetRepository } = await loadApi();
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readTokenRows = () => [
    {
      token: 'sent-token-v2',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      name: '再発行済み',
      studentUrl: 'https://example.com/exec?t=sent-token-v2',
      revoked: false
    },
    {
      token: 'new-token',
      courseId: 'course-2',
      courseName: '化学B',
      rosterKey: 'course-2::student-2',
      studentId: 'student-2',
      name: '未配付',
      studentUrl: 'https://example.com/exec?t=new-token',
      revoked: false
    }
  ];
  SheetRepository.readDistributionLogs = () => [
    { token: 'sent-token-v1', rosterKey: 'course-1::student-1', status: 'SUCCESS', classroomAnnouncementId: 'ann-1' }
  ];
  SheetRepository.getCheckedCourses = () => {
    throw new Error('roster-only preview should not fall back to checked courses');
  };
  SheetRepository.getSettingValue = (key) => {
    if (key === 'CLASSROOM_SEND_BATCH_SIZE') return '20';
    if (key === 'DRY_RUN') return 'false';
    if (key === 'ENABLE_DISTRIBUTION_LOG') return 'true';
    return '';
  };

  const preview = DistributionService.getDistributionTargetsPreview({
    rosterKeys: ['course-1::student-1'],
    forceRedistribute: true,
    dryRun: true,
    batchSize: 5
  });

  assert.equal(JSON.stringify(preview.courseIds), JSON.stringify([]));
  assert.equal(JSON.stringify(preview.rosterKeys), JSON.stringify(['course-1::student-1']));
  assert.equal(JSON.stringify(preview.tokens), JSON.stringify([]));
  assert.equal(preview.forceRedistribute, true);
  assert.equal(preview.retryFailedOnly, false);
  assert.equal(preview.batchSize, 5);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.targetCount, 1);
  assert.equal(preview.failedTargetCount, 0);
  assert.equal(preview.targets[0].token, 'sent-token-v2');
});

test('mol problem engine normalizes numeric input and rounds significant digits', async () => {
  const { normalizeNumericInput, roundToSignificantDigits, isAnswerCorrect } = await loadApi();
  const atomMass = 12 / 6.02e23;

  assert.equal(normalizeNumericInput('１．２３'), 1.23);
  assert.equal(normalizeNumericInput('6.0×10^23'), 6.0e23);
  assert.equal(normalizeNumericInput('６．０×１０＾２３'), 6.0e23);
  assert.equal(normalizeNumericInput('1.0e23'), 1.0e23);
  assert.equal(roundToSignificantDigits(1234, 3), 1230);
  assert.equal(roundToSignificantDigits(0.012345, 3), 0.0123);
  assert.ok(Math.abs(roundToSignificantDigits(atomMass, 3) - 1.99e-23) / 1.99e-23 < 1e-12);
  assert.equal(isAnswerCorrect('2.00', 2.004, 0.01, 3), true);
  assert.equal(isAnswerCorrect('2.20', 2.004, 0.01, 3), false);
});

test('answer judgment uses enumerated rounded candidates for beginner and intermediate', async () => {
  const { isAnswerCorrect } = await loadApi();

  assert.equal(isAnswerCorrect('2', 2.0, 0.01, 2, 'beginner'), true);
  assert.equal(isAnswerCorrect('0.5', 0.50, 0.01, 2, 'beginner'), true);
  assert.equal(isAnswerCorrect('19.5', 20.4, 0.01, 2, 'beginner'), false);

  assert.equal(isAnswerCorrect('2.00', 2.004, 0.02, 3, 'intermediate'), true);
  assert.equal(isAnswerCorrect('0.5', 0.50, 0.02, 3, 'intermediate'), true);
  assert.equal(isAnswerCorrect('19.5', 20.4, 0.02, 3, 'intermediate'), false);

  for (const level of ['beginner', 'intermediate']) {
    assert.equal(isAnswerCorrect('29.25', 29.25, 0.02, 3, level), true);
    assert.equal(isAnswerCorrect('29.250', 29.25, 0.02, 3, level), true);
    assert.equal(isAnswerCorrect('29.3', 29.25, 0.02, 3, level), true);
    assert.equal(isAnswerCorrect('29', 29.25, 0.02, 3, level), true);
    assert.equal(isAnswerCorrect('29.26', 29.25, 0.02, 3, level), false);
    assert.equal(isAnswerCorrect('29.24', 29.25, 0.02, 3, level), false);
    assert.equal(isAnswerCorrect('30', 29.25, 0.02, 3, level), false);
  }
});

test('beginner and intermediate grading accepts exact and natural rounded generated answers', async () => {
  const { AnswerService, MolProblemService } = await loadApi();
  const originalPickSubstance = MolProblemService.pickSubstance_;
  const originalPickNumber = MolProblemService.pickNumber_;
  const nacl = {
    formula: 'NaCl',
    name: '塩化ナトリウム',
    molarMass: 58.5,
    isGasAtSTP: false,
    type: 'ionic'
  };

  MolProblemService.pickSubstance_ = () => nacl;
  MolProblemService.pickNumber_ = (values) => {
    if (Array.isArray(values) && values.includes(0.5)) {
      return 0.5;
    }
    return originalPickNumber.call(MolProblemService, values);
  };

  try {
    const beginner = MolProblemService.generateProblem({ level: 'beginner', problemType: 1 });
    assert.equal(beginner.rawExpectedAnswer, 29.25);
    assert.equal(beginner.expectedAnswer, 29.25);
    assert.equal(beginner.displayAnswer, '29.25');
    assert.equal(MolProblemService.gradeProblemAnswer(beginner, '29.25').isCorrect, true);
    assert.equal(MolProblemService.gradeProblemAnswer(beginner, '29.250').isCorrect, true);
    assert.deepEqual(
      ['29.3', '29'].map((answer) => MolProblemService.gradeProblemAnswer(beginner, answer).isCorrect),
      [true, true]
    );
    assert.deepEqual(
      ['29.26', '29.24', '30'].map((answer) => MolProblemService.gradeProblemAnswer(beginner, answer).isCorrect),
      [false, false, false]
    );
    const roundedGrade = MolProblemService.gradeProblemAnswer(beginner, '29.3');
    assert.equal(roundedGrade.acceptedAnswerType, 'rounded');
    assert.equal(roundedGrade.acceptedAnswer, 29.3);
    const response = AnswerService.buildSubmitAnswerResponse(
      {
        isCorrect: true,
        expectedAnswer: beginner.expectedAnswer,
        submittedAnswer: '29.3',
        normalizedSubmittedAnswer: 29.3,
        unit: beginner.unit,
        explanation: beginner.explanation,
        level: beginner.level,
        significantDigits: beginner.significantDigits,
        requiresRounding: beginner.requiresRounding,
        acceptedAnswerType: roundedGrade.acceptedAnswerType,
        exactAnswer: beginner.rawExpectedAnswer
      },
      {},
      MolProblemService.toPublicProblem(beginner)
    );
    assert.equal(response.result.expectedAnswerText, '29.25 g');
    assert.equal(response.result.acceptedAnswerType, 'rounded');
    assert.equal(response.result.exactAnswerText, '29.25 g');

    const intermediate = MolProblemService.generateProblem({ level: 'intermediate', problemType: 1 });
    assert.equal(intermediate.rawExpectedAnswer, 29.25);
    assert.equal(intermediate.expectedAnswer, 29.25);
    assert.equal(intermediate.displayAnswer, '29.25');
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '29.25').isCorrect, true);
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '29.250').isCorrect, true);
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '29.3').isCorrect, true);
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '29').isCorrect, true);
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '29.26').isCorrect, false);
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '29.24').isCorrect, false);
    assert.equal(MolProblemService.gradeProblemAnswer(intermediate, '30').isCorrect, false);
  } finally {
    MolProblemService.pickSubstance_ = originalPickSubstance;
    MolProblemService.pickNumber_ = originalPickNumber;
  }
});

test('advanced answer judgment compares three significant digits with relative tolerance for tiny values', async () => {
  const { isAnswerCorrect } = await loadApi();

  assert.equal(isAnswerCorrect('2.004', 2.0039, 0.00001, 3, 'advanced'), true);
  assert.equal(isAnswerCorrect('2.014', 2.0039, 0.00001, 3, 'advanced'), false);
  assert.equal(isAnswerCorrect('2.00e-23', 1.99e-23, 0.01, 3, 'advanced'), true);
  assert.equal(isAnswerCorrect('0', 1.99e-23, 0.005, 3, 'advanced'), false);
});

test('chemical formula display html uses only sub tags and escapes unsafe input', async () => {
  const { MolProblemService } = await loadApi();

  assert.equal(MolProblemService.formatChemicalFormulaHtml('H2'), 'H<sub>2</sub>');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('CO2'), 'CO<sub>2</sub>');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('C6H12O6'), 'C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('H2SO4'), 'H<sub>2</sub>SO<sub>4</sub>');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('CaCO3'), 'CaCO<sub>3</sub>');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('NaCl'), 'NaCl');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('HCl'), 'HCl');
  assert.equal(MolProblemService.formatChemicalFormulaHtml('H2<script>alert(1)</script>'), 'H2&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('advanced type13 atom mass problems keep tiny answers and reject zero', async () => {
  const { MolProblemService } = await loadApi();
  const originalPickElement = MolProblemService.pickElement_;
  MolProblemService.pickElement_ = () => ({
    formula: 'C',
    name: '炭素',
    atomicMass: 12.0,
    isGasAtSTP: false,
    type: 'element'
  });

  try {
    const problem = MolProblemService.generateAdvancedProblem({ problemType: 13 });

    assert.equal(problem.problemTypeId, 13);
    assert.equal(problem.problemType, 'atomic_mass_to_atom_mass');
    assert.ok(problem.expectedAnswer >= 1e-23 && problem.expectedAnswer < 1e-22);
    assert.ok(Math.abs(problem.expectedAnswer - 1.99e-23) / 1.99e-23 < 1e-12);
    assert.equal(
      MolProblemService.isAnswerCorrect('0', problem.expectedAnswer, problem.tolerance, problem.significantDigits, problem.level),
      false
    );
  } finally {
    MolProblemService.pickElement_ = originalPickElement;
  }
});

test('mol problem engine generates level-appropriate signed problems', async () => {
  const { MolProblemService } = await loadApi();
  const beginnerTypes = new Set(MolProblemService.getProblemTypeIdsForLevel('beginner'));
  const intermediateTypes = new Set(MolProblemService.getProblemTypeIdsForLevel('intermediate'));
  const advancedTypes = new Set(MolProblemService.getProblemTypeIdsForLevel('advanced'));

  for (let index = 0; index < 20; index += 1) {
    const beginner = MolProblemService.generateProblem('beginner');
    assert.equal(beginner.level, 'beginner');
    assert.equal(beginner.avogadroConstant, 6.0e23);
    assert.ok(beginnerTypes.has(MolProblemService.getProblemTypeId(beginner.problemType)));
    assert.ok(beginner.problemId.startsWith('MP_'));
    assert.equal(MolProblemService.verifyProblemIntegrity(beginner), true);

    const intermediate = MolProblemService.generateProblem('intermediate');
    assert.equal(intermediate.level, 'intermediate');
    assert.equal(intermediate.avogadroConstant, 6.0e23);
    assert.ok(intermediateTypes.has(MolProblemService.getProblemTypeId(intermediate.problemType)));
    assert.equal(MolProblemService.verifyProblemIntegrity(intermediate), true);

    const advanced = MolProblemService.generateProblem('advanced');
    assert.equal(advanced.level, 'advanced');
    assert.equal(advanced.avogadroConstant, 6.02e23);
    assert.ok(advancedTypes.has(MolProblemService.getProblemTypeId(advanced.problemType)));
    assert.equal(advanced.significantDigits, 3);
    assert.equal(MolProblemService.verifyProblemIntegrity(advanced), true);
  }
});

test('level setting values are cached during repeated problem generation', async () => {
  const { MolProblemService, SheetRepository } = await loadApi();
  const readCounts = new Map();
  SheetRepository.getSettingValue = (key) => {
    readCounts.set(key, (readCounts.get(key) || 0) + 1);
    return '';
  };

  MolProblemService.generateProblem({ level: 'beginner', problemType: 1 });
  MolProblemService.generateProblem({ level: 'beginner', problemType: 2 });
  MolProblemService.generateProblem({ level: 'beginner', problemType: 3 });

  assert.equal(readCounts.get('BEGINNER_AVOGADRO_CONSTANT'), 1);
  assert.equal(readCounts.get('BEGINNER_TOLERANCE'), 1);
});

test('mol problem public payload hides answers and server can restore by token and attemptId', async () => {
  const { MolProblemService } = await loadApi();
  const issued = MolProblemService.issueProblemForToken('token-1', { level: 'advanced', problemType: 14 });
  const publicProblem = issued.publicProblem;

  assert.equal(publicProblem.level, 'advanced');
  assert.ok(publicProblem.problemId.startsWith('MP_'));
  assert.ok(publicProblem.attemptId.startsWith('ATT_'));
  assert.equal(typeof publicProblem.questionText, 'string');
  assert.equal(typeof publicProblem.unit, 'string');
  assert.equal(typeof publicProblem.inputHint, 'string');
  assert.ok(Array.isArray(publicProblem.givenValues));
  assert.ok(publicProblem.givenValues.length > 0);
  assert.equal(typeof publicProblem.givenValuesTitle, 'string');
  assert.ok(publicProblem.givenValues.every((item) => typeof item.label === 'string' && typeof item.value === 'string'));
  assert.ok(publicProblem.givenValues.every((item) => !Object.hasOwn(item, 'isRequired')));
  assert.equal(Object.hasOwn(publicProblem, 'expectedAnswer'), false);
  assert.equal(Object.hasOwn(publicProblem, 'displayAnswer'), false);
  assert.equal(Object.hasOwn(publicProblem, 'explanation'), false);
  assert.equal(typeof publicProblem.questionHtml, 'string');
  assert.ok(publicProblem.givenValues.every((item) => typeof item.labelHtml === 'string' && typeof item.valueHtml === 'string'));
  assert.equal(Object.hasOwn(publicProblem, 'substance'), false);

  const restored = MolProblemService.getStoredProblemForToken('token-1', publicProblem.attemptId);
  assert.equal(restored.problemId, publicProblem.problemId);
  assert.equal(restored.attemptId, publicProblem.attemptId);
  assert.equal(typeof restored.expectedAnswer, 'number');
  assert.equal(typeof restored.explanation, 'string');
  assert.throws(() => MolProblemService.getStoredProblemForToken('other-token', publicProblem.attemptId), /問題データが見つかりません/);
});

test('public problem display html formats formulas without changing plain text fields', async () => {
  const { MolProblemService } = await loadApi();
  const originalPickSubstance = MolProblemService.pickSubstance_;
  MolProblemService.pickSubstance_ = () => ({
    formula: 'C6H12O6',
    name: 'グルコース',
    molarMass: 180,
    isGasAtSTP: false,
    type: 'compound'
  });

  try {
    const problem = MolProblemService.generateProblem({ level: 'beginner', problemType: 1 });
    const publicProblem = MolProblemService.toPublicProblem(problem);

    assert.match(publicProblem.questionText, /C6H12O6/);
    assert.match(publicProblem.questionHtml, /C<sub>6<\/sub>H<sub>12<\/sub>O<sub>6<\/sub>/);
    assert.ok(publicProblem.givenValues.some((item) => item.label.includes('C6H12O6')));
    assert.ok(publicProblem.givenValues.some((item) => /C<sub>6<\/sub>H<sub>12<\/sub>O<sub>6<\/sub>/.test(item.labelHtml)));
  } finally {
    MolProblemService.pickSubstance_ = originalPickSubstance;
  }
});

test('public problem hints mention significant digits only for advanced level', async () => {
  const { MolProblemService } = await loadApi();

  const beginner = MolProblemService.toPublicProblem(MolProblemService.generateProblem({ level: 'beginner', problemType: 1 }));
  const intermediate = MolProblemService.toPublicProblem(MolProblemService.generateProblem({ level: 'intermediate', problemType: 1 }));
  const advanced = MolProblemService.toPublicProblem(MolProblemService.generateProblem({ level: 'advanced', problemType: 1 }));

  assert.doesNotMatch(beginner.inputHint, /有効数字/);
  assert.doesNotMatch(intermediate.inputHint, /有効数字/);
  assert.match(advanced.inputHint, /有効数字3桁で答えよう/);
});

test('getPracticeProblem validates token and returns public problems for every level', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      ['active-token', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ]
  });
  const { AnswerService, SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};

  for (const level of ['beginner', 'intermediate', 'advanced']) {
    const problem = AnswerService.getPracticeProblem('active-token', { level });

    assert.equal(problem.level, level);
    assert.ok(problem.attemptId.startsWith('ATT_'));
    assert.equal(Object.hasOwn(problem, 'expectedAnswer'), false);
    assert.equal(Object.hasOwn(problem, 'explanation'), false);
    assert.equal(Object.hasOwn(problem, 'problemHash'), false);
  }
});

test('given values include only required values for beginner and intermediate problem types', async () => {
  const { MolProblemService } = await loadApi();
  const massOrFormula = /モル質量|式量/;
  const expectations = new Map([
    [1, [massOrFormula]],
    [2, [massOrFormula]],
    [3, ['アボガドロ定数']],
    [4, ['アボガドロ定数']],
    [5, ['標準状態のモル体積']],
    [6, ['標準状態のモル体積']],
    [7, [massOrFormula, 'アボガドロ定数']],
    [8, ['アボガドロ定数', massOrFormula]],
    [9, [massOrFormula, '標準状態のモル体積']],
    [10, ['標準状態のモル体積', massOrFormula]],
    [11, ['標準状態のモル体積', 'アボガドロ定数']],
    [12, ['アボガドロ定数', '標準状態のモル体積']]
  ]);

  for (const [typeId, requiredLabelParts] of expectations) {
    const level = typeId <= 6 ? 'beginner' : 'intermediate';
    const problem = MolProblemService.generateProblem({ level, problemType: typeId });
    const publicProblem = MolProblemService.toPublicProblem(problem);

    assert.equal(problem.givenValues.length, requiredLabelParts.length, `${level} type ${typeId} should expose only required values`);
    assert.equal(publicProblem.givenValuesTitle, 'この問題で使う値');
    assert.ok(problem.givenValues.every((item) => item.isRequired === true));
    for (const labelPart of requiredLabelParts) {
      const matches = labelPart instanceof RegExp
        ? (item) => labelPart.test(item.label)
        : (item) => item.label.includes(labelPart);
      assert.ok(
        problem.givenValues.some(matches),
        `type ${typeId} should include ${labelPart}`
      );
    }
  }
});

test('adaptive problem weights prioritize weak unattempted and slow types but suppress third repeat', async () => {
  const { AdaptiveProblemService } = await loadApi();
  const statsRows = [
    { level: 'beginner', problemType: 'mol_to_mass', attempts: 5, correct: 2, accuracy: 0.4, recentAttempts: 5, recentCorrect: 2, recentAccuracy: 0.4, averageElapsedMs: 3000, recentAverageElapsedMs: 3200 },
    { level: 'beginner', problemType: 'mass_to_mol', attempts: 1, correct: 1, accuracy: 1, recentAttempts: 1, recentCorrect: 1, recentAccuracy: 1, averageElapsedMs: 900, recentAverageElapsedMs: 900 },
    { level: 'beginner', problemType: 'mol_to_particles', attempts: 4, correct: 4, accuracy: 1, recentAttempts: 4, recentCorrect: 4, recentAccuracy: 1, averageElapsedMs: 7000, recentAverageElapsedMs: 7500 },
    { level: 'beginner', problemType: 'particles_to_mol', attempts: 4, correct: 4, accuracy: 1, recentAttempts: 4, recentCorrect: 4, recentAccuracy: 1, averageElapsedMs: 1200, recentAverageElapsedMs: 1200 }
  ];

  const weights = AdaptiveProblemService.buildProblemTypeWeights('beginner', statsRows, ['mol_to_mass', 'mol_to_mass']);
  const byType = Object.fromEntries(weights.map((row) => [row.problemType, row.weight]));

  assert.equal(byType.mol_to_mass, 0);
  assert.ok(byType.gas_volume_to_mol > byType.mass_to_mol, 'unattempted beginner types should be favored over low-attempt types');
  assert.ok(byType.mol_to_particles > byType.particles_to_mol, 'slow types should get a small boost');
});

test('getPracticeProblem uses adaptive problem type cache without scanning answer logs', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      ['active-token', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ],
    問題タイプ別キャッシュ: [
      ['updatedAt', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'level', 'problemType', 'attempts', 'correct', 'accuracy', 'recentAttempts', 'recentCorrect', 'recentAccuracy', 'averageElapsedMs', 'elapsedCount', 'recentAverageElapsedMs', 'lastAnsweredAt', 'lastIsCorrect', 'lastElapsedMs'],
      ['2026-05-21T10:00:00.000Z', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'beginner', 'mol_to_mass', 5, 1, 0.2, 5, 1, 0.2, 2000, 5, 2000, '2026-05-21T10:00:00.000Z', false, 2000],
      ['2026-05-21T10:01:00.000Z', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'beginner', 'mass_to_mol', 5, 5, 1, 5, 5, 1, 900, 5, 900, '2026-05-21T10:01:00.000Z', true, 900]
    ],
    解答ログ: [
      ['timestamp', 'rosterKey'],
      ['2026-05-21T09:00:00.000Z', 'course-1::student-1']
    ],
    設定: [
      ['キー', '値', '説明', '更新日時'],
      ['ENABLE_ADAPTIVE_PROBLEM_SELECTION', 'true', '', '']
    ]
  });
  const { AnswerService, SheetRepository, AdaptiveProblemService } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used during adaptive problem generation');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('readAnswerLogsForRosterKey should not be used during adaptive problem generation');
  };
  AdaptiveProblemService.pickWeightedProblemType_ = () => 'mol_to_mass';

  const problem = AnswerService.getPracticeProblem('active-token', { level: 'beginner' });

  assert.equal(problem.problemType, 'mol_to_mass');
});

test('adaptive selection uses CacheService stats before reading the sheet cache', async () => {
  const cacheStore = new Map();
  const CacheService = {
    getScriptCache() {
      return {
        get: (key) => cacheStore.get(key) || null,
        put: (key, value) => {
          cacheStore.set(key, value);
        },
        remove: (key) => {
          cacheStore.delete(key);
        }
      };
    }
  };
  const { AdaptiveProblemService, SheetRepository } = await loadApi({ CacheService });
  const rosterKey = 'course-1::student-1';
  const stats = [
    { level: 'beginner', problemType: 'mol_to_mass', attempts: 3, correct: 0, accuracy: 0, recentAttempts: 3, recentCorrect: 0, recentAccuracy: 0, averageElapsedMs: 2000, recentAverageElapsedMs: 2000 }
  ];
  cacheStore.set(AdaptiveProblemService.createStatsCacheKey_(rosterKey, 'beginner'), JSON.stringify(stats));
  SheetRepository.readProblemTypeStatsForRosterKey = () => {
    throw new Error('sheet cache should not be read when CacheService has stats');
  };
  let capturedWeights = null;
  AdaptiveProblemService.pickWeightedProblemType_ = (weights) => {
    capturedWeights = weights;
    return 'mol_to_mass';
  };

  const selected = AdaptiveProblemService.selectProblemTypeForStudent({ rosterKey }, 'beginner', {});

  assert.equal(selected, 'mol_to_mass');
  assert.ok(capturedWeights.some((row) => row.problemType === 'mol_to_mass' && row.weight > 1));
});

test('adaptive selection disabled keeps getPracticeProblem on the random path', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      ['active-token', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ],
    設定: [
      ['キー', '値', '説明', '更新日時'],
      ['ENABLE_ADAPTIVE_PROBLEM_SELECTION', 'false', '', '']
    ]
  });
  const { AnswerService, SheetRepository, AdaptiveProblemService } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readProblemTypeStatsForRosterKey = () => {
    throw new Error('problem type stats should not be read when adaptive selection is disabled');
  };
  AdaptiveProblemService.selectProblemTypeForStudent = () => {
    throw new Error('adaptive selector should not run when disabled');
  };

  const problem = AnswerService.getPracticeProblem('active-token', { level: 'beginner' });

  assert.equal(problem.level, 'beginner');
  assert.ok(problem.attemptId.startsWith('ATT_'));
});

test('advanced public problems may include correct dummy given values without exposing isRequired', async () => {
  const { MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem({ level: 'advanced', problemType: 1 });
  const publicProblem = MolProblemService.toPublicProblem(problem);

  assert.ok(problem.givenValues.some((item) => item.isRequired === true));
  assert.ok(problem.givenValues.some((item) => item.isRequired === false));
  assert.equal(publicProblem.givenValuesTitle, '与えられた値');
  assert.equal(publicProblem.givenValues.length, problem.givenValues.length);
  assert.ok(publicProblem.givenValues.every((item) => !Object.hasOwn(item, 'isRequired')));
  assert.ok(publicProblem.givenValues.some((item) => item.label.includes('アボガドロ定数') || item.label.includes('標準状態のモル体積')));
});

test('substance metadata and gas-only problem types are chemically constrained', async () => {
  const { MolProblemService } = await loadApi();
  const substances = MolProblemService.getSubstances();
  const nacl = substances.find((substance) => substance.formula === 'NaCl');
  const glucose = substances.find((substance) => substance.formula === 'C6H12O6');

  assert.ok(substances.every((substance) => (
    typeof substance.formula === 'string'
    && typeof substance.name === 'string'
    && typeof substance.molarMass === 'number'
    && typeof substance.isGasAtSTP === 'boolean'
    && typeof substance.type === 'string'
  )));
  assert.equal(nacl.isGasAtSTP, false);
  assert.equal(glucose.isGasAtSTP, false);

  for (const typeId of [5, 6, 9, 10, 11, 12]) {
    for (let index = 0; index < 20; index += 1) {
      const problem = MolProblemService.generateProblem({ level: 'advanced', problemType: typeId });
      assert.equal(problem.substance.isGasAtSTP, true, `type ${typeId} should use gas at STP`);
      assert.notEqual(problem.substance.formula, 'NaCl');
      assert.notEqual(problem.substance.formula, 'C6H12O6');
    }
  }

  const atomProblem = MolProblemService.generateProblem({ level: 'advanced', problemType: 13 });
  assert.equal(atomProblem.substance.type, 'element');
  assert.equal(atomProblem.unit, 'g');
});

test('type 14 always gives enough amount information and returns g/mol', async () => {
  const { MolProblemService } = await loadApi();
  const amountModes = new Set();

  for (let index = 0; index < 30; index += 1) {
    const problem = MolProblemService.generateProblem({ level: 'advanced', problemType: 14 });
    assert.equal(problem.problemTypeId, 14);
    assert.equal(problem.unit, 'g/mol');
    assert.equal(problem.substance.formula, 'X');
    assert.equal(problem.given.unit, 'g');
    assert.ok(['mol', 'particles', 'gasVolume'].includes(problem.given.amountMode));
    amountModes.add(problem.given.amountMode);
    if (problem.given.amountMode === 'gasVolume') {
      assert.equal(problem.substance.isGasAtSTP, true);
      assert.equal(problem.given.secondaryUnit, 'L');
    }
  }
  assert.ok(amountModes.size >= 2);
});

test('sample validation test function checks level and chemistry constraints', async () => {
  const { validateProblemGenerationSamplesForTest } = await loadApi();
  const result = validateProblemGenerationSamplesForTest(80);

  assert.equal(result.ok, true);
  assert.equal(result.beginnerHasType7OrLater, false);
  assert.equal(result.intermediateHasType13Or14, false);
  assert.equal(result.gasProblemUsesNonGas, false);
  assert.equal(result.beginnerAnswersAreFriendly, true);
  assert.equal(result.advancedHasRoundingCase, true);
  assert.equal(result.advancedSawType13, true);
  assert.equal(result.advancedSawType14, true);
});

test('answer service summarizes total and recent ten attempts for one student', async () => {
  const { AnswerService } = await loadApi();
  const logs = Array.from({ length: 12 }, (_, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    rosterKey: index === 0 ? 'other-course::student-x' : 'course-1::student-1',
    isCorrect: index % 3 !== 0,
    level: index < 4 ? 'beginner' : index < 8 ? 'intermediate' : 'advanced'
  }));

  const summary = AnswerService.summarizeAnswerLogsForStudent('course-1::student-1', logs);

  assert.equal(summary.totalAttempts, 11);
  assert.equal(summary.totalCorrect, 8);
  assert.equal(summary.recent10Attempts, 10);
  assert.equal(summary.recent10Correct, 7);
  assert.equal(summary.recent10Accuracy, 0.7);
  assert.equal(summary.currentCorrectStreak, 2);
  assert.equal(summary.beginnerAttempts, 3);
  assert.equal(summary.intermediateAttempts, 4);
  assert.equal(summary.advancedAttempts, 4);
});

test('answer service summarizes level correct counts accuracy recent ten levels and latest metadata', async () => {
  const { AnswerService } = await loadApi();
  const levels = [
    'beginner',
    'beginner',
    'advanced',
    'intermediate',
    'beginner',
    'intermediate',
    'advanced',
    'advanced',
    'intermediate',
    'beginner',
    'intermediate',
    'advanced'
  ];
  const correctByIndex = new Set([0, 2, 3, 5, 7, 9, 10]);
  const logs = levels.map((level, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    rosterKey: 'course-1::student-1',
    isCorrect: correctByIndex.has(index),
    level,
    problemType: `type-${index}`
  }));

  const summary = AnswerService.summarizeAnswerLogsForStudent('course-1::student-1', logs);

  assert.equal(summary.beginnerAttempts, 4);
  assert.equal(summary.beginnerCorrect, 2);
  assert.equal(summary.beginnerAccuracy, 0.5);
  assert.equal(summary.intermediateAttempts, 4);
  assert.equal(summary.intermediateCorrect, 3);
  assert.equal(summary.intermediateAccuracy, 0.75);
  assert.equal(summary.advancedAttempts, 4);
  assert.equal(summary.advancedCorrect, 2);
  assert.equal(summary.advancedAccuracy, 0.5);
  assert.equal(summary.recent10BeginnerAttempts, 2);
  assert.equal(summary.recent10IntermediateAttempts, 4);
  assert.equal(summary.recent10AdvancedAttempts, 4);
  assert.equal(summary.lastLevel, 'advanced');
  assert.equal(summary.lastProblemType, 'type-11');
});

test('answer summary current streak stops at the most recent incorrect answer', async () => {
  const { AnswerService } = await loadApi();
  const logs = [
    { timestamp: '2026-05-20T12:00:00.000Z', rosterKey: 'course-1::student-1', isCorrect: true, level: 'beginner' },
    { timestamp: '2026-05-20T12:01:00.000Z', rosterKey: 'course-1::student-1', isCorrect: false, level: 'beginner' },
    { timestamp: '2026-05-20T12:02:00.000Z', rosterKey: 'course-1::student-1', isCorrect: true, level: 'intermediate' },
    { timestamp: '2026-05-20T12:03:00.000Z', rosterKey: 'course-1::student-1', isCorrect: true, level: 'advanced' },
    { timestamp: '2026-05-20T12:04:00.000Z', rosterKey: 'course-1::student-1', isCorrect: true, level: 'advanced' }
  ];

  const summary = AnswerService.summarizeAnswerLogsForStudent('course-1::student-1', logs);

  assert.equal(summary.currentCorrectStreak, 3);

  const afterIncorrect = AnswerService.summarizeAnswerLogsForStudent('course-1::student-1', [
    ...logs,
    { timestamp: '2026-05-20T12:05:00.000Z', rosterKey: 'course-1::student-1', isCorrect: false, level: 'advanced' }
  ]);
  assert.equal(afterIncorrect.currentCorrectStreak, 0);
});

test('answer submission response includes result summary and next public problem', async () => {
  const { AnswerService, MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem({ level: 'beginner', problemType: 2 });
  const entry = {
    isCorrect: true,
    expectedAnswer: problem.expectedAnswer,
    submittedAnswer: '2.0',
    unit: problem.unit,
    explanation: problem.explanation,
    level: 'advanced',
    significantDigits: 3,
    requiresRounding: true
  };
  const summary = {
    totalAttempts: 12,
    totalCorrect: 9,
    recent10Attempts: 10,
    recent10Correct: 8,
    recent10Accuracy: 0.8,
    currentCorrectStreak: 5
  };
  const nextProblem = MolProblemService.toPublicProblem(MolProblemService.generateProblem('beginner'));

  const response = AnswerService.buildSubmitAnswerResponse(entry, summary, nextProblem);

  assert.equal(response.ok, true);
  assert.equal(response.result.isCorrect, true);
  assert.match(response.result.expectedAnswerText, new RegExp(problem.unit.replace('/', '\\/')));
  assert.equal(response.result.totalAttempts, 12);
  assert.equal(response.result.recent10Accuracy, 0.8);
  assert.equal(response.result.currentCorrectStreak, 5);
  assert.equal(response.result.level, 'advanced');
  assert.equal(response.result.significantDigits, 3);
  assert.equal(response.result.requiresRounding, true);
  assert.equal(Object.hasOwn(response.nextProblem, 'expectedAnswer'), false);
});

test('answer service detects duplicate attempts by attemptId for the same student', async () => {
  const { AnswerService } = await loadApi();
  const logs = [
    { attemptId: 'ATT_same', rosterKey: 'course-1::student-1', isCorrect: true },
    { attemptId: 'ATT_same', rosterKey: 'course-2::student-1', isCorrect: false }
  ];

  assert.equal(AnswerService.hasDuplicateAttempt('course-1::student-1', 'ATT_same', logs), true);
  assert.equal(AnswerService.hasDuplicateAttempt('course-1::student-1', 'ATT_other', logs), false);
});

test('same problem content issued twice uses different attemptIds and records separate answers', async () => {
  const { SheetRepository, MolProblemService, AnswerService } = await loadApi();
  const tokenRow = {
    token: 'active-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  const logs = [];
  const originalPickElement = MolProblemService.pickElement_;
  MolProblemService.pickElement_ = () => ({
    formula: 'C',
    name: '炭素',
    atomicMass: 12.0,
    isGasAtSTP: false,
    type: 'element'
  });

  try {
    const first = MolProblemService.issueProblemForToken('active-token', { level: 'advanced', problemType: 13 });
    const second = MolProblemService.issueProblemForToken('active-token', { level: 'advanced', problemType: 13 });

    assert.equal(first.problem.problemId, second.problem.problemId);
    assert.equal(first.problem.problemHash, second.problem.problemHash);
    assert.notEqual(first.problem.attemptId, second.problem.attemptId);
    assert.equal(first.publicProblem.attemptId, first.problem.attemptId);
    assert.equal(second.publicProblem.attemptId, second.problem.attemptId);

    SheetRepository.findToken = (token) => token === tokenRow.token ? tokenRow : null;
    SheetRepository.withDocumentLock = (callback) => callback();
    SheetRepository.findAnswerLogByAttemptId = (rosterKey, attemptId) =>
      logs.find((row) => row.rosterKey === rosterKey && row.attemptId === attemptId) || null;
    SheetRepository.appendAnswerLog = (entry) => {
      logs.push(entry);
    };
    SheetRepository.readAnswerLogsForRosterKey = () => logs;
    SheetRepository.findAggregateCacheByRosterKey = () => null;
    SheetRepository.readLatestAnswerLogsForRosterKey = () => logs.slice(-10);
    SheetRepository.upsertAggregateCacheRow = () => {};
    SheetRepository.findProblemTypeStatsRow = () => null;
    SheetRepository.upsertProblemTypeStatsRow = () => {};

    const firstResponse = AnswerService.submitAnswer({
      token: 'active-token',
      problem: first.publicProblem,
      submittedAnswer: String(first.problem.expectedAnswer)
    });
    const secondResponse = AnswerService.submitAnswer({
      token: 'active-token',
      problem: second.publicProblem,
      submittedAnswer: String(second.problem.expectedAnswer)
    });

    assert.equal(firstResponse.duplicate, false);
    assert.equal(secondResponse.duplicate, false);
    assert.equal(logs.length, 2);
    assert.deepEqual(logs.map((row) => row.attemptId), [first.problem.attemptId, second.problem.attemptId]);
  } finally {
    MolProblemService.pickElement_ = originalPickElement;
  }
});

test('submitAnswer updates only the submitted student cache row without full log or cache rewrites', async () => {
  const answerHeaders = [
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
  ];
  const aggregateHeaders = [
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
  ];
  const problemTypeHeaders = [
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
  ];
  const tokenRow = {
    token: 'active-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  const levels = ['beginner', 'beginner', 'beginner', 'intermediate', 'intermediate', 'intermediate', 'advanced', 'advanced', 'advanced'];
  const existingAnswerRows = levels.map((level, index) => [
    `2026-05-20T09:0${index}:00.000Z`,
    `ATT_old_${index}`,
    tokenRow.token,
    tokenRow.courseId,
    tokenRow.courseName,
    tokenRow.rosterKey,
    tokenRow.studentId,
    tokenRow.number,
    tokenRow.name,
    level,
    `type-${index}`,
    `question-${index}`,
    1,
    1,
    1,
    'mol',
    index % 2 === 0,
    0.01,
    3,
    '',
    false,
    `explanation-${index}`,
    1000 + index * 100,
    '{}'
  ]);
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      [tokenRow.token, tokenRow.courseId, tokenRow.courseName, tokenRow.rosterKey, tokenRow.studentId, tokenRow.number, tokenRow.name, 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ],
    解答ログ: [
      answerHeaders,
      ...existingAnswerRows,
      ['2026-05-21T09:30:00.000Z', 'ATT_other', 'other-token', 'course-1', '化学A', 'course-1::student-2', 'student-2', '8', '佐藤 花子', 'beginner', 'type-other', 'other question', 1, 1, 1, 'mol', false, 0.01, 3, '', false, 'other', 900, '{}']
    ],
    集計キャッシュ: [
      aggregateHeaders,
      ['old-target', 'course-1', '化学A', tokenRow.rosterKey, tokenRow.studentId, tokenRow.number, tokenRow.name, 9, 5, 0.5556, 9, 5, 0.5556, 3, 2, 0.6667, 3, 1, 0.3333, 3, 2, 0.6667, 3, 3, 3, 'old-last', 'advanced', 'type-8', 1400, 1400, 1400, 1400, 1400, 1400, 1400, 0, 1800],
      ['old-other', 'course-1', '化学A', 'course-1::student-2', 'student-2', '8', '佐藤 花子', 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 'other-last', 'beginner', 'type-other', 900, 900, 900, 900, 0, 0, 900, 0, 900]
    ],
    問題タイプ別キャッシュ: [
      problemTypeHeaders,
      ['old-type-target', 'course-1', '化学A', tokenRow.rosterKey, tokenRow.studentId, tokenRow.number, tokenRow.name, 'beginner', 'mol_to_mass', 3, 2, 0.6667, 3, 2, 0.6667, 1200, 3, 1200, 'old-type-last', false, 1200],
      ['old-type-other', 'course-1', '化学A', tokenRow.rosterKey, tokenRow.studentId, tokenRow.number, tokenRow.name, 'intermediate', 'type-3', 2, 1, 0.5, 2, 1, 0.5, 900, 2, 900, 'old-other-last', true, 900]
    ]
  });
  const { SheetRepository, MolProblemService, AnswerService } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used during submitAnswer');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('readAnswerLogsForRosterKey should not be used during submitAnswer');
  };
  SheetRepository.readAggregateCache = () => {
    throw new Error('readAggregateCache should not be used during submitAnswer');
  };
  SheetRepository.writeAggregateCache = () => {
    throw new Error('writeAggregateCache should not be used during submitAnswer');
  };
  SheetRepository.readProblemTypeStatsRows = () => {
    throw new Error('readProblemTypeStatsRows should not be used during submitAnswer');
  };
  SheetRepository.writeProblemTypeStatsRows = () => {
    throw new Error('writeProblemTypeStatsRows should not be used during submitAnswer');
  };
  const issued = MolProblemService.issueProblemForToken(tokenRow.token, { level: 'beginner', problemType: 1 });

  const response = AnswerService.submitAnswer({
    token: tokenRow.token,
    problem: issued.publicProblem,
    submittedAnswer: String(issued.problem.expectedAnswer),
    elapsedMs: 2500,
    clientInfo: { userAgent: 'node-test' }
  });

  const aggregateRows = spreadsheetMock.sheets.get('集計キャッシュ').rows;
  const targetCacheRow = aggregateRows[1];
  const otherCacheRow = aggregateRows[2];
  assert.equal(response.duplicate, false);
  assert.equal(response.result.recent10Attempts, 10);
  assert.equal(response.result.recent10Correct, 6);
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('totalAttempts')], 10);
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('totalCorrect')], 6);
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('beginnerAttempts')], 4);
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('intermediateAttempts')], 3);
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('advancedAttempts')], 3);
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('recent10BeginnerAttempts')], 4);
  assert.equal(
    targetCacheRow[aggregateHeaders.indexOf('lastAnsweredAt')],
    spreadsheetMock.sheets.get('解答ログ').rows.at(-1)[answerHeaders.indexOf('timestamp')]
  );
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('lastLevel')], 'beginner');
  assert.equal(targetCacheRow[aggregateHeaders.indexOf('lastElapsedMs')], 2500);
  assert.equal(otherCacheRow[aggregateHeaders.indexOf('updatedAt')], 'old-other');
  const problemTypeRows = spreadsheetMock.sheets.get('問題タイプ別キャッシュ').rows;
  const targetProblemTypeRow = problemTypeRows[1];
  const otherProblemTypeRow = problemTypeRows[2];
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('attempts')], 4);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('correct')], 3);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('accuracy')], 0.75);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('recentAttempts')], 1);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('recentCorrect')], 1);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('averageElapsedMs')], 1525);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('elapsedCount')], 4);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('recentAverageElapsedMs')], 2500);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('lastIsCorrect')], true);
  assert.equal(targetProblemTypeRow[problemTypeHeaders.indexOf('lastElapsedMs')], 2500);
  assert.equal(otherProblemTypeRow[problemTypeHeaders.indexOf('updatedAt')], 'old-type-other');
  assert.deepEqual(spreadsheetMock.setValuesCalls.filter((call) => call.sheetName === '集計キャッシュ').map((call) => ({
    row: call.row,
    column: call.column,
    numRows: call.numRows,
    numColumns: call.numColumns
  })), [
    {
      row: 2,
      column: 1,
      numRows: 1,
      numColumns: aggregateHeaders.length
    }
  ]);
  assert.deepEqual(spreadsheetMock.setValuesCalls.filter((call) => call.sheetName === '問題タイプ別キャッシュ').map((call) => ({
    row: call.row,
    column: call.column,
    numRows: call.numRows,
    numColumns: call.numColumns
  })), [
    {
      row: 2,
      column: 1,
      numRows: 1,
      numColumns: problemTypeHeaders.length
    }
  ]);
});

test('submitAnswer rebuilds aggregate cache from all roster logs when cache row is missing', async () => {
  const { SheetRepository, MolProblemService, AnswerService } = await loadApi();
  const tokenRow = {
    token: 'active-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  const logs = Array.from({ length: 12 }, (_, index) => ({
    timestamp: `2026-05-20T09:${String(index).padStart(2, '0')}:00.000Z`,
    attemptId: `ATT_old_${index}`,
    token: tokenRow.token,
    courseId: tokenRow.courseId,
    courseName: tokenRow.courseName,
    rosterKey: tokenRow.rosterKey,
    studentId: tokenRow.studentId,
    number: tokenRow.number,
    name: tokenRow.name,
    level: index < 4 ? 'beginner' : index < 8 ? 'intermediate' : 'advanced',
    problemType: `type-${index}`,
    expectedAnswer: '1',
    submittedAnswer: '1',
    normalizedSubmittedAnswer: '1',
    unit: 'mol',
    isCorrect: index % 2 === 0,
    elapsedMs: 1000 + index
  }));
  let rebuiltSummary = null;
  SheetRepository.findToken = (token) => token === tokenRow.token ? tokenRow : null;
  SheetRepository.withDocumentLock = (callback) => callback();
  SheetRepository.findAnswerLogByAttemptId = (rosterKey, attemptId) =>
    logs.find((row) => row.rosterKey === rosterKey && row.attemptId === attemptId) || null;
  SheetRepository.appendAnswerLog = (entry) => {
    logs.push(entry);
  };
  SheetRepository.findAggregateCacheByRosterKey = () => null;
  SheetRepository.readLatestAnswerLogsForRosterKey = () => logs.slice(-10);
  SheetRepository.readAnswerLogsForRosterKey = (rosterKey) => logs.filter((row) => row.rosterKey === rosterKey);
  SheetRepository.upsertAggregateCacheRow = (summary) => {
    rebuiltSummary = summary;
  };
  SheetRepository.findProblemTypeStatsRow = () => null;
  SheetRepository.upsertProblemTypeStatsRow = () => {};
  const issued = MolProblemService.issueProblemForToken(tokenRow.token, { level: 'beginner', problemType: 1 });

  const response = AnswerService.submitAnswer({
    token: tokenRow.token,
    problem: issued.publicProblem,
    submittedAnswer: String(issued.problem.expectedAnswer),
    elapsedMs: 2500
  });

  assert.equal(response.duplicate, false);
  assert.equal(response.result.totalAttempts, 13);
  assert.equal(response.result.recent10Attempts, 10);
  assert.equal(rebuiltSummary.totalAttempts, 13);
  assert.equal(rebuiltSummary.totalCorrect, 7);
  assert.equal(rebuiltSummary.beginnerAttempts, 5);
  assert.equal(rebuiltSummary.intermediateAttempts, 4);
  assert.equal(rebuiltSummary.advancedAttempts, 4);
});

test('submitAnswer duplicate response restores the existing log without appending a second answer', async () => {
  const answerHeaders = [
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
  ];
  const tokenRow = {
    token: 'active-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      [tokenRow.token, tokenRow.courseId, tokenRow.courseName, tokenRow.rosterKey, tokenRow.studentId, tokenRow.number, tokenRow.name, 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ],
    解答ログ: [answerHeaders],
    集計キャッシュ: [
      ['updatedAt', 'rosterKey', 'totalAttempts', 'totalCorrect', 'totalAccuracy', 'recent10Attempts', 'recent10Correct', 'recent10Accuracy']
    ]
  });
  const { SheetRepository, MolProblemService, AnswerService } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used during duplicate submitAnswer');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('readAnswerLogsForRosterKey should not be used during duplicate submitAnswer');
  };
  SheetRepository.writeAggregateCache = () => {
    throw new Error('writeAggregateCache should not be used during duplicate submitAnswer');
  };
  const issued = MolProblemService.issueProblemForToken(tokenRow.token, { level: 'beginner', problemType: 1 });
  spreadsheetMock.sheets.get('解答ログ').rows.push([
    '2026-05-21T09:00:00.000Z',
    issued.problem.attemptId,
    tokenRow.token,
    tokenRow.courseId,
    tokenRow.courseName,
    tokenRow.rosterKey,
    tokenRow.studentId,
    tokenRow.number,
    tokenRow.name,
    issued.problem.level,
    issued.problem.problemType,
    issued.problem.questionText,
    issued.problem.expectedAnswer,
    String(issued.problem.expectedAnswer),
    issued.problem.expectedAnswer,
    issued.problem.unit,
    true,
    issued.problem.tolerance,
    issued.problem.significantDigits,
    issued.problem.avogadroConstant,
    issued.problem.requiresRounding === true,
    issued.problem.explanation,
    1500,
    '{}'
  ]);

  const response = AnswerService.submitAnswer({
    token: tokenRow.token,
    problem: issued.publicProblem,
    submittedAnswer: 'wrong answer',
    elapsedMs: 9999
  });

  assert.equal(response.duplicate, true);
  assert.equal(response.result.isCorrect, true);
  assert.equal(response.result.totalAttempts, 1);
  assert.equal(spreadsheetMock.sheets.get('解答ログ').rows.length, 2);
  assert.equal(
    spreadsheetMock.setValuesCalls.filter((call) => call.sheetName === '解答ログ').length,
    0,
    'duplicate submit should not append an answer log row'
  );
});

test('submitAnswer uses adaptive selection for the prefetched next problem', async () => {
  const { SheetRepository, MolProblemService, AnswerService, AdaptiveProblemService } = await loadApi();
  const tokenRow = {
    token: 'active-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  const logs = [];
  SheetRepository.findToken = (token) => token === tokenRow.token ? tokenRow : null;
  SheetRepository.withDocumentLock = (callback) => callback();
  SheetRepository.findAnswerLogByAttemptId = () => null;
  SheetRepository.appendAnswerLog = (entry) => {
    logs.push(entry);
  };
  SheetRepository.findAggregateCacheByRosterKey = () => ({
    rosterKey: tokenRow.rosterKey,
    totalAttempts: 0,
    totalCorrect: 0,
    recent10Attempts: 0,
    recent10Correct: 0,
    beginnerAttempts: 0,
    intermediateAttempts: 0,
    advancedAttempts: 0
  });
  SheetRepository.readLatestAnswerLogsForRosterKey = () => logs.slice(-10);
  SheetRepository.upsertAggregateCacheRow = () => {};
  SheetRepository.findProblemTypeStatsRow = () => null;
  SheetRepository.readAnswerLogsForRosterKey = () => logs;
  SheetRepository.upsertProblemTypeStatsRow = () => {};
  SheetRepository.getSettingValue = (key) => key === 'ENABLE_ADAPTIVE_PROBLEM_SELECTION' ? 'true' : '';
  AdaptiveProblemService.selectProblemTypeForStudent = (_tokenRow, level) => level === 'beginner' ? 'mass_to_mol' : '';
  const issued = MolProblemService.issueProblemForToken(tokenRow.token, { level: 'beginner', problemType: 1 });

  const response = AnswerService.submitAnswer({
    token: tokenRow.token,
    problem: issued.publicProblem,
    submittedAnswer: String(issued.problem.expectedAnswer),
    nextLevel: 'beginner'
  });

  assert.equal(response.nextProblem.level, 'beginner');
  assert.equal(response.nextProblem.problemType, 'mass_to_mol');
});

test('mol problem integrity check detects expected-answer tampering', async () => {
  const { MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem('beginner');
  const tampered = {
    ...problem,
    expectedAnswer: Number(problem.expectedAnswer) * 2 + 1
  };

  assert.equal(MolProblemService.verifyProblemIntegrity(problem), true);
  assert.equal(MolProblemService.verifyProblemIntegrity(tampered), false);
});

test('sample problem test function returns five problems for each level', async () => {
  const { generateSampleProblemsForTest } = await loadApi();
  const samples = generateSampleProblemsForTest();

  assert.equal(samples.beginner.length, 5);
  assert.equal(samples.intermediate.length, 5);
  assert.equal(samples.advanced.length, 5);
  assert.ok(samples.beginner.every((problem) => problem.level === 'beginner'));
  assert.ok(samples.intermediate.every((problem) => problem.level === 'intermediate'));
  assert.ok(samples.advanced.every((problem) => problem.level === 'advanced'));
});

test('aggregation cache calculates totals and recent ten accuracy per student', async () => {
  const { AggregationService } = await loadApi();
  const logs = Array.from({ length: 12 }, (_, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    level: index < 4 ? 'beginner' : index < 8 ? 'intermediate' : 'advanced',
    problemType: `type-${index}`,
    isCorrect: index % 3 !== 0
  }));

  const rows = AggregationService.buildAggregateRows(logs, '2026-05-20T13:00:00.000Z');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalAttempts, 12);
  assert.equal(rows[0].totalCorrect, 8);
  assert.equal(rows[0].totalAccuracy, 0.6667);
  assert.equal(rows[0].recent10Attempts, 10);
  assert.equal(rows[0].recent10Correct, 7);
  assert.equal(rows[0].recent10Accuracy, 0.7);
  assert.equal(rows[0].beginnerAttempts, 4);
  assert.equal(rows[0].beginnerCorrect, 2);
  assert.equal(rows[0].beginnerAccuracy, 0.5);
  assert.equal(rows[0].intermediateAttempts, 4);
  assert.equal(rows[0].intermediateCorrect, 3);
  assert.equal(rows[0].intermediateAccuracy, 0.75);
  assert.equal(rows[0].advancedAttempts, 4);
  assert.equal(rows[0].advancedCorrect, 3);
  assert.equal(rows[0].advancedAccuracy, 0.75);
  assert.equal(rows[0].recent10BeginnerAttempts, 2);
  assert.equal(rows[0].recent10IntermediateAttempts, 4);
  assert.equal(rows[0].recent10AdvancedAttempts, 4);
  assert.equal(rows[0].lastAnsweredAt, '2026-05-20T12:11:00.000Z');
  assert.equal(rows[0].lastLevel, 'advanced');
  assert.equal(rows[0].lastProblemType, 'type-11');
});

test('problem type stats cache groups by student level and problem type', async () => {
  const { AggregationService } = await loadApi();
  const logs = Array.from({ length: 12 }, (_, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    level: 'beginner',
    problemType: index % 2 === 0 ? 'type-1' : 'type-2',
    isCorrect: index % 3 !== 0,
    elapsedMs: index === 2 ? 100 : 1000 + index * 100
  }));

  const rows = AggregationService.buildProblemTypeStatsRows(logs, '2026-05-20T13:00:00.000Z');
  const type1 = rows.find((row) => row.problemType === 'type-1');

  assert.equal(rows.length, 2);
  assert.equal(type1.attempts, 6);
  assert.equal(type1.correct, 4);
  assert.equal(type1.accuracy, 0.6667);
  assert.equal(type1.recentAttempts, 6);
  assert.equal(type1.recentCorrect, 4);
  assert.equal(type1.averageElapsedMs, 1560);
  assert.equal(type1.elapsedCount, 5);
  assert.equal(type1.recentAverageElapsedMs, 1560);
  assert.equal(type1.lastAnsweredAt, '2026-05-20T12:10:00.000Z');
  assert.equal(type1.lastIsCorrect, true);
  assert.equal(type1.lastElapsedMs, 2000);
});

test('rebuildAggregateCache also rebuilds problem type stats cache', async () => {
  const { AggregationService, SheetRepository } = await loadApi();
  const logs = [
    {
      timestamp: '2026-05-20T12:00:00.000Z',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      level: 'beginner',
      problemType: 'type-1',
      isCorrect: false,
      elapsedMs: 1200
    },
    {
      timestamp: '2026-05-20T12:01:00.000Z',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      level: 'beginner',
      problemType: 'type-1',
      isCorrect: true,
      elapsedMs: 1800
    }
  ];
  let aggregateRows = null;
  let problemTypeRows = null;
  SheetRepository.readAnswerLogs = () => logs;
  SheetRepository.writeAggregateCache = (rows) => {
    aggregateRows = rows;
  };
  SheetRepository.writeProblemTypeStatsRows = (rows) => {
    problemTypeRows = rows;
  };

  const result = AggregationService.rebuildAggregateCache();

  assert.equal(result.updated, 1);
  assert.equal(result.problemTypeUpdated, 1);
  assert.equal(aggregateRows.length, 1);
  assert.equal(problemTypeRows.length, 1);
  assert.equal(problemTypeRows[0].attempts, 2);
  assert.equal(problemTypeRows[0].correct, 1);
});

test('aggregation cache calculates elapsed time averages medians and improvement rate', async () => {
  const { AggregationService } = await loadApi();
  const elapsedMsValues = [100000, 90000, 80000, 70000, 0, -1, 499, 1800001, 20000, 10000, 8000, 5000];
  const logs = elapsedMsValues.map((elapsedMs, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    level: 'beginner',
    isCorrect: index % 3 !== 0,
    elapsedMs
  }));

  const rows = AggregationService.buildAggregateRows(logs, '2026-05-20T13:00:00.000Z');

  assert.equal(rows[0].averageElapsedMs, 47875);
  assert.equal(rows[0].medianElapsedMs, 45000);
  assert.equal(rows[0].recent10AverageElapsedMs, 32167);
  assert.equal(rows[0].recent10MedianElapsedMs, 15000);
  assert.equal(rows[0].correctAverageElapsedMs, 40600);
  assert.equal(rows[0].correctRecent10AverageElapsedMs, 28250);
  assert.equal(rows[0].first10AverageElapsedMs, 61667);
  assert.equal(rows[0].speedImprovementRate, 0.4784);
  assert.equal(rows[0].lastElapsedMs, 5000);
});

test('student answer summary calculates elapsed metrics without exposing them to student response', async () => {
  const { AnswerService } = await loadApi();
  const logs = [120000, 90000, 60000, 30000, 0, 45000, 30000, 15000, 9000, 6000, 3000].map((elapsedMs, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    rosterKey: 'course-1::student-1',
    level: 'beginner',
    isCorrect: index !== 3,
    elapsedMs
  }));

  const summary = AnswerService.summarizeAnswerLogsForStudent('course-1::student-1', logs);
  const response = AnswerService.buildSubmitAnswerResponse(
    {
      isCorrect: true,
      expectedAnswer: 1,
      normalizedSubmittedAnswer: 1,
      unit: 'mol',
      significantDigits: 2,
      explanation: '',
      level: 'beginner',
      problemType: ''
    },
    summary,
    { attemptId: 'next' }
  );

  assert.equal(summary.averageElapsedMs, 40800);
  assert.equal(summary.recent10AverageElapsedMs, 32000);
  assert.equal(summary.first10AverageElapsedMs, 45000);
  assert.equal(summary.speedImprovementRate, 0.2889);
  assert.equal(Object.hasOwn(response.result, 'averageElapsedMs'), false);
  assert.equal(Object.hasOwn(response.result, 'recent10AverageElapsedMs'), false);
});

test('initializeStudentSession reads summary from aggregate cache without scanning answer logs', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      ['active-token', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ],
    集計キャッシュ: [
      ['updatedAt', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'totalAttempts', 'totalCorrect', 'totalAccuracy', 'recent10Attempts', 'recent10Correct', 'recent10Accuracy', 'beginnerAttempts', 'beginnerCorrect', 'beginnerAccuracy', 'intermediateAttempts', 'intermediateCorrect', 'intermediateAccuracy', 'advancedAttempts', 'advancedCorrect', 'advancedAccuracy', 'recent10BeginnerAttempts', 'recent10IntermediateAttempts', 'recent10AdvancedAttempts', 'lastAnsweredAt', 'lastLevel', 'lastProblemType', 'averageElapsedMs', 'medianElapsedMs', 'recent10AverageElapsedMs', 'recent10MedianElapsedMs', 'correctAverageElapsedMs', 'correctRecent10AverageElapsedMs', 'first10AverageElapsedMs', 'speedImprovementRate', 'lastElapsedMs'],
      ['2026-05-21T11:00:00.000Z', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 12, 9, 0.75, 10, 8, 0.8, 4, 3, 0.75, 4, 3, 0.75, 4, 3, 0.75, 2, 4, 4, '2026-05-21T10:59:00.000Z', 'advanced', 'type-12', 40000, 35000, 30000, 28000, 32000, 26000, 50000, 0.4, 25000]
    ],
    解答ログ: [
      ['timestamp', 'rosterKey'],
      ['2026-05-21T09:00:00.000Z', 'course-1::student-1']
    ]
  });
  const { AnswerService, SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used during student initialization');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('readAnswerLogsForRosterKey should not be used during student initialization');
  };

  const session = AnswerService.initializeStudentSession('active-token', { level: 'beginner' });

  assert.equal(session.ok, true);
  assert.equal(session.student.name, '山田 太郎');
  assert.equal(session.summary.totalAttempts, 12);
  assert.equal(session.summary.recent10Accuracy, 0.8);
  assert.equal(session.summary.lastLevel, 'advanced');
  assert.ok(session.problem.attemptId);
  assert.equal(spreadsheetMock.setValueCalls.length, 1);
  assert.equal(spreadsheetMock.setValueCalls[0].sheetName, 'トークン管理');
  assert.equal(spreadsheetMock.setValueCalls[0].row, 2);
  assert.equal(spreadsheetMock.setValueCalls[0].column, 11);
  assert.match(spreadsheetMock.setValueCalls[0].value, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(spreadsheetMock.setValuesCalls.length, 0, 'student first access should not rewrite token rows');
  assert.equal(
    spreadsheetMock.rangeCalls.some((call) =>
      call.sheetName === '解答ログ' && call.row === 2
    ),
    false,
    'student initialization should not read answer log rows'
  );
});

test('submit answer response includes display-only explanation html while logs keep plain question text', async () => {
  const { AnswerService, MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem({ level: 'beginner', problemType: 1 });
  problem.problemId = 'MP_test';
  problem.attemptId = 'ATT_test';
  problem.questionText = '水素 H2 1 mol は何 g ですか。';
  problem.explanation = 'H2 のモル質量は 2 g/mol です。';

  const response = AnswerService.buildSubmitAnswerResponse(
    {
      isCorrect: true,
      expectedAnswer: problem.expectedAnswer,
      submittedAnswer: '2',
      normalizedSubmittedAnswer: 2,
      unit: problem.unit,
      explanation: problem.explanation,
      level: problem.level,
      problemType: problem.problemType,
      significantDigits: problem.significantDigits,
      requiresRounding: problem.requiresRounding
    },
    { totalAttempts: 1, totalCorrect: 1, totalAccuracy: 1, recent10Attempts: 1, recent10Correct: 1, recent10Accuracy: 1 },
    MolProblemService.toPublicProblem(problem)
  );

  assert.equal(response.result.explanation, 'H2 のモル質量は 2 g/mol です。');
  assert.equal(response.result.explanationHtml, 'H<sub>2</sub> のモル質量は 2 g/mol です。');
  assert.equal(response.nextProblem.questionText, '水素 H2 1 mol は何 g ですか。');
  assert.match(response.nextProblem.questionHtml, /H<sub>2<\/sub>/);
});

test('teacher preview session uses admin auth, mock student data, and no student token side effects', async () => {
  const { initializeTeacherPreviewSession, SheetRepository } = await loadApi({
    PropertiesService: createScriptPropertiesMock({ MOL_DRILL_ADMIN_TOKEN: 'admin-secret' }).PropertiesService
  });
  SheetRepository.findToken = () => {
    throw new Error('teacher preview should not read student tokens');
  };
  SheetRepository.recordTokenAccess = () => {
    throw new Error('teacher preview should not update lastAccessedAt');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('teacher preview should not read answer logs');
  };
  SheetRepository.findAggregateCacheByRosterKey = () => {
    throw new Error('teacher preview should not read aggregate cache');
  };

  const session = initializeTeacherPreviewSession('admin-secret', { level: 'beginner' });

  assert.equal(session.ok, true);
  assert.equal(session.student.courseName, '教師プレビュー');
  assert.equal(session.student.number, '確認用');
  assert.equal(session.student.name, '先生');
  assert.equal(session.summary.totalAttempts, 0);
  assert.ok(session.problem.attemptId);
  assert.equal(session.problem.level, 'beginner');
  assert.throws(
    () => initializeTeacherPreviewSession('wrong-secret', { level: 'beginner' }),
    /管理ダッシュボードの内部認証が一致しません/
  );
});

test('teacher preview session can display the student tied to the preview token without side effects', async () => {
  const { initializeTeacherPreviewSession, SheetRepository } = await loadApi({
    PropertiesService: createScriptPropertiesMock({ MOL_DRILL_ADMIN_TOKEN: 'admin-secret' }).PropertiesService
  });
  const tokenRow = {
    token: 'student-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  SheetRepository.findToken = (token) => token === tokenRow.token ? tokenRow : null;
  SheetRepository.recordTokenAccess = () => {
    throw new Error('teacher preview should not update lastAccessedAt');
  };
  SheetRepository.appendAnswerLog = () => {
    throw new Error('teacher preview should not append answer logs');
  };
  SheetRepository.upsertAggregateCacheRow = () => {
    throw new Error('teacher preview should not update aggregate cache');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('teacher preview should not read answer logs');
  };
  SheetRepository.findAggregateCacheByRosterKey = () => {
    throw new Error('teacher preview should not read aggregate cache');
  };

  const session = initializeTeacherPreviewSession('admin-secret', {
    level: 'beginner',
    studentToken: 'student-token'
  });

  assert.equal(session.ok, true);
  assert.equal(session.student.courseName, '化学A');
  assert.equal(session.student.number, '7');
  assert.equal(session.student.name, '山田 太郎');
  assert.equal(session.summary.totalAttempts, 0);
});

test('teacher preview answer grades and issues the next problem without logs or aggregate writes', async () => {
  const { getTeacherPreviewProblem, submitTeacherPreviewAnswer, SheetRepository } = await loadApi({
    PropertiesService: createScriptPropertiesMock({ MOL_DRILL_ADMIN_TOKEN: 'admin-secret' }).PropertiesService
  });
  SheetRepository.findToken = () => {
    throw new Error('teacher preview should not validate student token');
  };
  SheetRepository.withDocumentLock = () => {
    throw new Error('teacher preview should not take a document lock');
  };
  SheetRepository.appendAnswerLog = () => {
    throw new Error('teacher preview should not append answer logs');
  };
  SheetRepository.recordTokenAccess = () => {
    throw new Error('teacher preview should not update lastAccessedAt');
  };
  SheetRepository.upsertAggregateCacheRow = () => {
    throw new Error('teacher preview should not update aggregate cache');
  };

  const problem = getTeacherPreviewProblem('admin-secret', { level: 'intermediate' });
  const response = submitTeacherPreviewAnswer('admin-secret', {
    problem,
    submittedAnswer: 'wrong answer',
    elapsedMs: 1200,
    nextLevel: 'advanced'
  });

  assert.equal(response.ok, true);
  assert.equal(response.result.isCorrect, false);
  assert.match(response.result.expectedAnswerText, /\S/);
  assert.match(response.result.explanation, /\S/);
  assert.equal(response.result.totalAttempts, 0);
  assert.equal(response.nextProblem.level, 'advanced');
});

test('getStudentState returns a zero summary when aggregate cache has no matching row', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'メール', 'studentUrl', 'issuedAt', 'lastAccessedAt', 'revoked', 'note'],
      ['active-token', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', 'a@example.com', 'https://example.com?t=active-token', '2026-05-20T12:00:00.000Z', '', false, '']
    ],
    集計キャッシュ: [
      ['updatedAt', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'totalAttempts', 'totalCorrect', 'totalAccuracy', 'recent10Attempts', 'recent10Correct', 'recent10Accuracy']
    ],
    解答ログ: [
      ['timestamp', 'rosterKey'],
      ['2026-05-21T09:00:00.000Z', 'course-1::student-1']
    ]
  });
  const { AnswerService, SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};
  SheetRepository.readAggregateCache = () => {
    throw new Error('readAggregateCache should not be used for student state');
  };
  SheetRepository.readAnswerLogs = () => {
    throw new Error('readAnswerLogs should not be used for student state');
  };
  SheetRepository.readAnswerLogsForRosterKey = () => {
    throw new Error('readAnswerLogsForRosterKey should not be used for student state');
  };

  const state = AnswerService.getStudentState('active-token');

  assert.equal(state.student.rosterKey, 'course-1::student-1');
  assert.equal(state.summary.totalAttempts, 0);
  assert.equal(state.summary.totalCorrect, 0);
  assert.equal(state.summary.recent10Attempts, 0);
  assert.equal(state.summary.recent10Accuracy, 0);
});

test('initializeStudentSession keeps the invalid URL message for revoked tokens', async () => {
  const spreadsheetMock = createSpreadsheetMock({
    トークン管理: [
      ['token', 'courseId', 'courseName', 'rosterKey', 'studentId', '出席番号', '氏名', 'revoked'],
      ['revoked-token', 'course-1', '化学A', 'course-1::student-1', 'student-1', '7', '山田 太郎', true]
    ],
    集計キャッシュ: [
      ['rosterKey', 'totalAttempts']
    ]
  });
  const { AnswerService, SheetRepository } = await loadApi({ SpreadsheetApp: spreadsheetMock.SpreadsheetApp });
  SheetRepository.assertManagementSchemaReady = () => {};

  assert.throws(
    () => AnswerService.initializeStudentSession('revoked-token', {}),
    /無効なURLです。先生に新しいURLを確認してください。.*無効化/
  );
});

test('aggregation progress rows include active students with no attempts and flag risk groups', async () => {
  const { AggregationService } = await loadApi();
  const students = [
    {
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      status: '在籍'
    },
    {
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-2',
      studentId: 'student-2',
      number: '8',
      name: '佐藤 花子',
      status: '在籍'
    }
  ];
  const summaries = [
    {
      rosterKey: 'course-1::student-1',
      totalAttempts: 12,
      totalCorrect: 5,
      totalAccuracy: 0.4167,
      recent10Attempts: 10,
      recent10Correct: 4,
      recent10Accuracy: 0.4,
      beginnerAttempts: 4,
      beginnerCorrect: 2,
      beginnerAccuracy: 0.5,
      intermediateAttempts: 4,
      intermediateCorrect: 2,
      intermediateAccuracy: 0.5,
      advancedAttempts: 4,
      advancedCorrect: 1,
      advancedAccuracy: 0.25,
      recent10BeginnerAttempts: 2,
      recent10IntermediateAttempts: 4,
      recent10AdvancedAttempts: 4,
      lastAnsweredAt: '2026-05-20T12:11:00.000Z'
    }
  ];
  const tokens = [
    {
      token: 'token-1',
      rosterKey: 'course-1::student-1',
      studentUrl: 'https://example.com/exec?t=token-1',
      lastAccessedAt: '2026-05-20T11:55:00.000Z',
      revoked: false
    },
    {
      token: 'token-2',
      rosterKey: 'course-1::student-2',
      studentUrl: 'https://example.com/exec?t=token-2',
      lastAccessedAt: '2026-05-20T11:56:00.000Z',
      revoked: false
    }
  ];
  const distributionLogs = [
    { rosterKey: 'course-1::student-1', token: 'token-1', status: 'SUCCESS' },
    { rosterKey: 'course-1::student-2', token: 'token-2', status: 'SUCCESS' }
  ];

  const rows = AggregationService.buildAdminProgressRows(students, summaries, tokens, distributionLogs);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].distributionStatus, '配付済み');
  assert.equal(rows[0].accessStatus, 'アクセス済み');
  assert.equal(rows[0].statusLabel, '要フォロー');
  assert.equal(rows[0].followUp, true);
  assert.equal(rows[1].totalAttempts, 0);
  assert.equal(rows[1].statusLabel, '未実施');
  assert.equal(rows[1].accessStatus, 'アクセス済み');
  assert.equal(rows[1].lastAnsweredAt, '');
  assert.equal(rows[0].beginnerCorrect, 2);
  assert.equal(rows[0].beginnerAccuracy, 0.5);
  assert.equal(rows[0].recent10AdvancedAttempts, 4);
});

test('aggregation progress rows identify unissued, unaccessed, speed-risk, and advanced statuses', async () => {
  const { AggregationService } = await loadApi();
  const students = [
    { courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-1', studentId: 'student-1', number: '1', name: '未配付', status: '在籍' },
    { courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-2', studentId: 'student-2', number: '2', name: '未アクセス', status: '在籍' },
    { courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-3', studentId: 'student-3', number: '3', name: '速度リスク', status: '在籍' },
    { courseId: 'course-1', courseName: '化学A', rosterKey: 'course-1::student-4', studentId: 'student-4', number: '4', name: '上級', status: '在籍' }
  ];
  const tokens = [
    { token: 'token-2', rosterKey: 'course-1::student-2', studentUrl: 'https://example.com/exec?t=token-2', lastAccessedAt: '', revoked: false },
    { token: 'token-3', rosterKey: 'course-1::student-3', studentUrl: 'https://example.com/exec?t=token-3', lastAccessedAt: '2026-05-20T12:00:00.000Z', revoked: false },
    { token: 'token-4', rosterKey: 'course-1::student-4', studentUrl: 'https://example.com/exec?t=token-4', lastAccessedAt: '2026-05-20T12:00:00.000Z', revoked: false }
  ];
  const summaries = [
    {
      rosterKey: 'course-1::student-3',
      totalAttempts: 12,
      totalCorrect: 9,
      totalAccuracy: 0.75,
      recent10Attempts: 10,
      recent10Correct: 5,
      recent10Accuracy: 0.5,
      beginnerAttempts: 8,
      intermediateAttempts: 4,
      advancedAttempts: 0,
      speedImprovementRate: 0.35,
      recent10AverageElapsedMs: 30000,
      first10AverageElapsedMs: 60000,
      lastAnsweredAt: '2026-05-20T12:12:00.000Z'
    },
    {
      rosterKey: 'course-1::student-4',
      totalAttempts: 12,
      totalCorrect: 10,
      totalAccuracy: 0.8333,
      recent10Attempts: 10,
      recent10Correct: 8,
      recent10Accuracy: 0.8,
      beginnerAttempts: 2,
      intermediateAttempts: 3,
      advancedAttempts: 7,
      speedImprovementRate: 0.2,
      recent10AverageElapsedMs: 45000,
      lastAnsweredAt: '2026-05-20T12:12:00.000Z'
    }
  ];
  const distributionLogs = [
    { rosterKey: 'course-1::student-2', token: 'token-2', status: 'SUCCESS' },
    { rosterKey: 'course-1::student-3', token: 'token-3', status: 'SUCCESS' },
    { rosterKey: 'course-1::student-4', token: 'token-4', status: 'SUCCESS' }
  ];

  const rows = AggregationService.buildAdminProgressRows(students, summaries, tokens, distributionLogs);

  assert.equal(rows[0].distributionStatus, '未配付');
  assert.equal(rows[0].statusLabel, '未配付');
  assert.equal(rows[1].accessStatus, '未アクセス');
  assert.equal(rows[1].statusLabel, '未アクセス');
  assert.equal(rows[2].statusLabel, '速度上昇・正答率低下');
  assert.equal(rows[2].followUp, true);
  assert.equal(rows[3].statusLabel, '上級挑戦中');
});

test('admin dashboard metrics summarize distribution access answers levels and follow-up counts', async () => {
  const { AggregationService } = await loadApi();
  const metrics = AggregationService.buildAdminDashboardMetrics([
    {
      distributionStatus: '配付済み',
      accessStatus: 'アクセス済み',
      totalAttempts: 12,
      totalCorrect: 8,
      recent10Attempts: 10,
      recent10Correct: 7,
      beginnerAttempts: 4,
      intermediateAttempts: 4,
      advancedAttempts: 4,
      speedImprovementRate: 0.25,
      followUp: false
    },
    {
      distributionStatus: '配付済み',
      accessStatus: '未アクセス',
      totalAttempts: 0,
      totalCorrect: 0,
      recent10Attempts: 0,
      recent10Correct: 0,
      beginnerAttempts: 0,
      intermediateAttempts: 0,
      advancedAttempts: 0,
      speedImprovementRate: 0,
      followUp: true
    },
    {
      distributionStatus: '未配付',
      accessStatus: '未アクセス',
      totalAttempts: 0,
      totalCorrect: 0,
      recent10Attempts: 0,
      recent10Correct: 0,
      beginnerAttempts: 0,
      intermediateAttempts: 0,
      advancedAttempts: 0,
      speedImprovementRate: 0,
      followUp: false
    }
  ]);

  assert.equal(metrics.distributedCount, 2);
  assert.equal(metrics.accessedCount, 1);
  assert.equal(metrics.answeredCount, 1);
  assert.equal(metrics.notStartedCount, 2);
  assert.equal(metrics.totalAnswers, 12);
  assert.equal(metrics.averageAccuracy, 0.6667);
  assert.equal(metrics.recent10AverageAccuracy, 0.7);
  assert.equal(metrics.beginnerAnswers, 4);
  assert.equal(metrics.intermediateAnswers, 4);
  assert.equal(metrics.advancedAnswers, 4);
  assert.equal(metrics.speedImprovedStudentCount, 1);
  assert.equal(metrics.followUpStudentCount, 1);
});
