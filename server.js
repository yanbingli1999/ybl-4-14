const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const math = require('mathjs');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DATASETS_FILE = path.join(DATA_DIR, 'datasets.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const BATCHES_FILE = path.join(DATA_DIR, 'batches.json');

const BATCH_STATES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  RETURNED: 'returned',
  VOIDED: 'voided',
  ARCHIVED: 'archived'
};

const VALID_TRANSITIONS = {
  [BATCH_STATES.DRAFT]: [BATCH_STATES.PENDING],
  [BATCH_STATES.PENDING]: [BATCH_STATES.APPROVED, BATCH_STATES.RETURNED, BATCH_STATES.VOIDED],
  [BATCH_STATES.RETURNED]: [BATCH_STATES.DRAFT],
  [BATCH_STATES.APPROVED]: [BATCH_STATES.ARCHIVED],
  [BATCH_STATES.VOIDED]: [],
  [BATCH_STATES.ARCHIVED]: []
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATASETS_FILE)) {
    fs.writeFileSync(DATASETS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(BATCHES_FILE)) {
    fs.writeFileSync(BATCHES_FILE, JSON.stringify([], null, 2));
  }
}
ensureDataFiles();

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function linearRegression(points) {
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  points.forEach(p => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { a: slope, b: intercept };
}

function exponentialRegression(points) {
  const invalidPoints = points.filter(p => p.y <= 0);
  if (invalidPoints.length > 0) {
    const indices = invalidPoints.map((_, i) => {
      const idx = points.indexOf(invalidPoints[i]) + 1;
      return `#${idx}(y=${invalidPoints[i].y})`;
    }).join(', ');
    throw new Error(`指数拟合要求所有Y值必须大于0，存在非法点: ${indices}`);
  }
  const n = points.length;
  const logPoints = points.map(p => ({ x: p.x, y: Math.log(p.y) }));
  const linearResult = linearRegression(logPoints);
  return { a: Math.exp(linearResult.b), b: linearResult.a };
}

function quadraticRegression(points) {
  const n = points.length;
  const rows = points.map(p => [p.x * p.x, p.x, 1]);
  const A = math.matrix(rows);
  const b = math.matrix(points.map(p => p.y));
  const AT = math.transpose(A);
  const ATA = math.multiply(AT, A);
  const ATb = math.multiply(AT, b);
  try {
    const ATAInv = math.inv(ATA);
    const x = math.multiply(ATAInv, ATb);
    const result = x.toArray();
    return { a: result[0], b: result[1], c: result[2] };
  } catch (e) {
    return { a: 0, b: 0, c: 0 };
  }
}

function calculateMetrics(points, modelType, params) {
  const n = points.length;
  let yMean = 0;
  points.forEach(p => yMean += p.y);
  yMean /= n;

  let ssTotal = 0;
  let ssResidual = 0;
  const residuals = [];
  let maeSum = 0;
  let rmseSum = 0;

  points.forEach(p => {
    let predicted;
    switch (modelType) {
      case 'linear':
        predicted = params.a * p.x + params.b;
        break;
      case 'exponential':
        predicted = params.a * Math.exp(params.b * p.x);
        break;
      case 'quadratic':
        predicted = params.a * p.x * p.x + params.b * p.x + params.c;
        break;
    }
    const residual = p.y - predicted;
    residuals.push(residual);
    ssResidual += residual * residual;
    ssTotal += (p.y - yMean) * (p.y - yMean);
    maeSum += Math.abs(residual);
    rmseSum += residual * residual;
  });

  const rSquared = 1 - (ssResidual / ssTotal);
  const mse = ssResidual / n;
  const rmse = Math.sqrt(rmseSum / n);
  const mae = maeSum / n;

  const residualStd = math.std(residuals);

  const outliers = residuals.map((r, i) => {
    const zScore = Math.abs(r - math.mean(residuals)) / residualStd;
    return { index: i, isOutlier: zScore > 2, zScore: zScore, residual: r };
  });

  return { rSquared, mse, rmse, mae, residuals, outliers };
}

function generateCurvePoints(points, modelType, params, numPoints = 100) {
  const xs = points.map(p => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const range = maxX - minX || 1;
  const extendedMin = minX - range * 0.1;
  const extendedMax = maxX + range * 0.1;
  const step = (extendedMax - extendedMin) / (numPoints - 1);
  const curvePoints = [];
  for (let i = 0; i < numPoints; i++) {
    const x = extendedMin + i * step;
    let y;
    switch (modelType) {
      case 'linear':
        y = params.a * x + params.b;
        break;
      case 'exponential':
        y = params.a * Math.exp(params.b * x);
        break;
      case 'quadratic':
        y = params.a * x * x + params.b * x + params.c;
        break;
    }
    curvePoints.push({ x, y });
  }
  return curvePoints;
}

app.get('/api/datasets', (req, res) => {
  const datasets = readJsonFile(DATASETS_FILE);
  res.json(datasets);
});

app.post('/api/datasets', (req, res) => {
  const { name, points } = req.body;
  if (!name || !points || !Array.isArray(points)) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  const datasets = readJsonFile(DATASETS_FILE);
  const dataset = {
    id: generateId(),
    name,
    points,
    createdAt: new Date().toISOString()
  };
  datasets.push(dataset);
  writeJsonFile(DATASETS_FILE, datasets);
  res.json(dataset);
});

app.put('/api/datasets/:id', (req, res) => {
  const { id } = req.params;
  const { name, points } = req.body;
  const datasets = readJsonFile(DATASETS_FILE);
  const index = datasets.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '数据集不存在' });
  }
  datasets[index].name = name || datasets[index].name;
  datasets[index].points = points || datasets[index].points;
  datasets[index].updatedAt = new Date().toISOString();
  writeJsonFile(DATASETS_FILE, datasets);
  res.json(datasets[index]);
});

app.delete('/api/datasets/:id', (req, res) => {
  const { id } = req.params;
  let datasets = readJsonFile(DATASETS_FILE);
  const initialLength = datasets.length;
  datasets = datasets.filter(d => d.id !== id);
  if (datasets.length === initialLength) {
    return res.status(404).json({ error: '数据集不存在' });
  }
  writeJsonFile(DATASETS_FILE, datasets);
  res.json({ success: true });
});

app.post('/api/fit', (req, res) => {
  const { datasetId, points, modelType, datasetName } = req.body;
  if (!points || !Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: '至少需要2个数据点' });
  }
  if (!modelType) {
    return res.status(400).json({ error: '请选择拟合模型' });
  }

  let params;
  let modelEquation;

  try {
    switch (modelType) {
      case 'linear':
        params = linearRegression(points);
        modelEquation = `y = ${params.a.toFixed(6)}x + ${params.b.toFixed(6)}`;
        break;
      case 'exponential':
        params = exponentialRegression(points);
        modelEquation = `y = ${params.a.toFixed(6)} · e^(${params.b.toFixed(6)}x)`;
        break;
      case 'quadratic':
        params = quadraticRegression(points);
        modelEquation = `y = ${params.a.toFixed(6)}x² + ${params.b.toFixed(6)}x + ${params.c.toFixed(6)}`;
        break;
      default:
        return res.status(400).json({ error: '不支持的模型类型' });
    }
  } catch (e) {
    return res.status(400).json({ error: '拟合计算失败: ' + e.message });
  }

  const metrics = calculateMetrics(points, modelType, params);
  const curvePoints = generateCurvePoints(points, modelType, params);

  const result = {
    id: generateId(),
    datasetId: datasetId || null,
    datasetName: datasetName || '未命名数据集',
    modelType,
    params,
    modelEquation,
    metrics: {
      rSquared: metrics.rSquared,
      mse: metrics.mse,
      rmse: metrics.rmse,
      mae: metrics.mae
    },
    residuals: metrics.residuals,
    outliers: metrics.outliers,
    curvePoints,
    points,
    createdAt: new Date().toISOString()
  };

  const history = readJsonFile(HISTORY_FILE);
  history.unshift(result);
  if (history.length > 50) {
    history.length = 50;
  }
  writeJsonFile(HISTORY_FILE, history);

  res.json(result);
});

app.get('/api/history', (req, res) => {
  const history = readJsonFile(HISTORY_FILE);
  const summaries = history.map(h => ({
    id: h.id,
    datasetId: h.datasetId,
    datasetName: h.datasetName,
    modelType: h.modelType,
    modelEquation: h.modelEquation,
    metrics: h.metrics,
    pointsCount: h.points.length,
    createdAt: h.createdAt
  }));
  res.json(summaries);
});

app.get('/api/history/:id', (req, res) => {
  const { id } = req.params;
  const history = readJsonFile(HISTORY_FILE);
  const result = history.find(h => h.id === id);
  if (!result) {
    return res.status(404).json({ error: '记录不存在' });
  }
  res.json(result);
});

app.delete('/api/history/:id', (req, res) => {
  const { id } = req.params;
  let history = readJsonFile(HISTORY_FILE);
  const initialLength = history.length;
  history = history.filter(h => h.id !== id);
  if (history.length === initialLength) {
    return res.status(404).json({ error: '记录不存在' });
  }
  writeJsonFile(HISTORY_FILE, history);
  res.json({ success: true });
});

function readBatches() {
  return readJsonFile(BATCHES_FILE);
}

function writeBatches(batches) {
  writeJsonFile(BATCHES_FILE, batches);
}

function isValidTransition(currentState, nextState) {
  const allowed = VALID_TRANSITIONS[currentState];
  return allowed && allowed.includes(nextState);
}

app.get('/api/batches', (req, res) => {
  const { state } = req.query;
  let batches = readBatches();
  if (state) {
    batches = batches.filter(b => b.state === state);
  }
  const summaries = batches.map(b => ({
    id: b.id,
    batchNo: b.batchNo,
    title: b.title,
    state: b.state,
    datasetName: b.fitResult?.datasetName,
    modelType: b.fitResult?.modelType,
    rSquared: b.fitResult?.metrics?.rSquared,
    submitter: b.submitter,
    reviewer: b.reviewer,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    submittedAt: b.submittedAt,
    reviewedAt: b.reviewedAt,
    archivedAt: b.archivedAt
  }));
  res.json(summaries);
});

app.get('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  const batches = readBatches();
  const batch = batches.find(b => b.id === id);
  if (!batch) {
    return res.status(404).json({ error: '批次不存在' });
  }
  res.json(batch);
});

app.post('/api/batches', (req, res) => {
  const { title, submitter, fitResultId } = req.body;
  if (!title) {
    return res.status(400).json({ error: '请输入批次标题' });
  }
  if (!fitResultId) {
    return res.status(400).json({ error: '请先执行拟合并选择拟合结果' });
  }

  const history = readJsonFile(HISTORY_FILE);
  const fitResult = history.find(h => h.id === fitResultId);
  if (!fitResult) {
    return res.status(404).json({ error: '拟合结果不存在' });
  }

  const batches = readBatches();
  const now = new Date().toISOString();
  const batchNo = 'BATCH-' + new Date().getFullYear() + '-' + String(batches.length + 1).padStart(5, '0');

  const batch = {
    id: generateId(),
    batchNo,
    title,
    state: BATCH_STATES.DRAFT,
    submitter: submitter || '未指定提交人',
    reviewer: null,
    fitResultId,
    fitResult: {
      id: fitResult.id,
      datasetId: fitResult.datasetId,
      datasetName: fitResult.datasetName,
      modelType: fitResult.modelType,
      modelEquation: fitResult.modelEquation,
      params: fitResult.params,
      metrics: fitResult.metrics,
      points: fitResult.points,
      curvePoints: fitResult.curvePoints,
      residuals: fitResult.residuals,
      outliers: fitResult.outliers
    },
    stateHistory: [
      {
        state: BATCH_STATES.DRAFT,
        timestamp: now,
        operator: submitter || '未指定提交人',
        comment: '创建批次草稿'
      }
    ],
    reviewOpinion: null,
    modificationNotes: [],
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    reviewedAt: null,
    archivedAt: null
  };

  batches.unshift(batch);
  writeBatches(batches);
  res.json(batch);
});

app.post('/api/batches/:id/submit', (req, res) => {
  const { id } = req.params;
  const { submitter } = req.body;
  const batches = readBatches();
  const index = batches.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '批次不存在' });
  }
  const batch = batches[index];
  if (!isValidTransition(batch.state, BATCH_STATES.PENDING)) {
    return res.status(400).json({ error: `当前状态「${batch.state}」不允许提交复核` });
  }

  const now = new Date().toISOString();
  const oldState = batch.state;
  batch.state = BATCH_STATES.PENDING;
  batch.submitter = submitter || batch.submitter;
  batch.submittedAt = now;
  batch.updatedAt = now;
  batch.stateHistory.push({
    state: BATCH_STATES.PENDING,
    fromState: oldState,
    timestamp: now,
    operator: batch.submitter,
    comment: '提交复核'
  });

  batches[index] = batch;
  writeBatches(batches);
  res.json(batch);
});

app.post('/api/batches/:id/review', (req, res) => {
  const { id } = req.params;
  const { decision, reviewer, comment } = req.body;
  const decisions = [BATCH_STATES.APPROVED, BATCH_STATES.RETURNED, BATCH_STATES.VOIDED];
  if (!decisions.includes(decision)) {
    return res.status(400).json({ error: '无效的复核决定' });
  }
  if (!reviewer) {
    return res.status(400).json({ error: '请填写复核人' });
  }

  const batches = readBatches();
  const index = batches.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '批次不存在' });
  }
  const batch = batches[index];
  if (!isValidTransition(batch.state, decision)) {
    return res.status(400).json({ error: `当前状态「${batch.state}」不允许执行此操作` });
  }

  const now = new Date().toISOString();
  const oldState = batch.state;
  batch.state = decision;
  batch.reviewer = reviewer;
  batch.reviewedAt = now;
  batch.updatedAt = now;
  batch.reviewOpinion = {
    decision,
    reviewer,
    comment: comment || '',
    timestamp: now
  };

  const decisionLabels = {
    [BATCH_STATES.APPROVED]: '复核通过',
    [BATCH_STATES.RETURNED]: '退回修改',
    [BATCH_STATES.VOIDED]: '作废处理'
  };

  batch.stateHistory.push({
    state: decision,
    fromState: oldState,
    timestamp: now,
    operator: reviewer,
    comment: `${decisionLabels[decision]}：${comment || '无意见'}`
  });

  batches[index] = batch;
  writeBatches(batches);
  res.json(batch);
});

app.post('/api/batches/:id/refit', (req, res) => {
  const { id } = req.params;
  const { modificationNote, submitter, fitResultId } = req.body;
  if (!modificationNote) {
    return res.status(400).json({ error: '请填写修改说明' });
  }
  if (!fitResultId) {
    return res.status(400).json({ error: '请先执行新的拟合' });
  }

  const history = readJsonFile(HISTORY_FILE);
  const fitResult = history.find(h => h.id === fitResultId);
  if (!fitResult) {
    return res.status(404).json({ error: '拟合结果不存在' });
  }

  const batches = readBatches();
  const index = batches.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '批次不存在' });
  }
  const batch = batches[index];
  if (!isValidTransition(batch.state, BATCH_STATES.DRAFT)) {
    return res.status(400).json({ error: `当前状态「${batch.state}」不允许重新拟合` });
  }

  const now = new Date().toISOString();
  const oldState = batch.state;
  const oldFitResultSnapshot = {
    modelEquation: batch.fitResult.modelEquation,
    rSquared: batch.fitResult.metrics?.rSquared
  };
  batch.state = BATCH_STATES.DRAFT;
  batch.submitter = submitter || batch.submitter;
  batch.updatedAt = now;
  batch.fitResultId = fitResultId;
  batch.fitResult = {
    id: fitResult.id,
    datasetId: fitResult.datasetId,
    datasetName: fitResult.datasetName,
    modelType: fitResult.modelType,
    modelEquation: fitResult.modelEquation,
    params: fitResult.params,
    metrics: fitResult.metrics,
    points: fitResult.points,
    curvePoints: fitResult.curvePoints,
    residuals: fitResult.residuals,
    outliers: fitResult.outliers
  };
  batch.modificationNotes.push({
    note: modificationNote,
    oldFitResult: oldFitResultSnapshot,
    newFitResult: {
      modelEquation: fitResult.modelEquation,
      rSquared: fitResult.metrics?.rSquared
    },
    operator: batch.submitter,
    timestamp: now
  });
  batch.stateHistory.push({
    state: BATCH_STATES.DRAFT,
    fromState: oldState,
    timestamp: now,
    operator: batch.submitter,
    comment: `重新拟合：${modificationNote}`
  });

  batches[index] = batch;
  writeBatches(batches);
  res.json(batch);
});

app.post('/api/batches/:id/archive', (req, res) => {
  const { id } = req.params;
  const { operator } = req.body;
  const batches = readBatches();
  const index = batches.findIndex(b => b.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '批次不存在' });
  }
  const batch = batches[index];
  if (!isValidTransition(batch.state, BATCH_STATES.ARCHIVED)) {
    return res.status(400).json({ error: `当前状态「${batch.state}」不允许归档` });
  }

  const now = new Date().toISOString();
  const oldState = batch.state;
  batch.state = BATCH_STATES.ARCHIVED;
  batch.archivedAt = now;
  batch.updatedAt = now;
  batch.stateHistory.push({
    state: BATCH_STATES.ARCHIVED,
    fromState: oldState,
    timestamp: now,
    operator: operator || '系统',
    comment: '已归档'
  });

  batches[index] = batch;
  writeBatches(batches);
  res.json(batch);
});

app.delete('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  let batches = readBatches();
  const batch = batches.find(b => b.id === id);
  if (!batch) {
    return res.status(404).json({ error: '批次不存在' });
  }
  if (batch.state !== BATCH_STATES.DRAFT && batch.state !== BATCH_STATES.RETURNED) {
    return res.status(400).json({ error: '仅草稿或退回状态可删除' });
  }
  batches = batches.filter(b => b.id !== id);
  writeBatches(batches);
  res.json({ success: true });
});

app.get('/api/meta/states', (req, res) => {
  res.json({
    states: BATCH_STATES,
    transitions: VALID_TRANSITIONS,
    stateLabels: {
      draft: '草稿',
      pending: '待复核',
      approved: '复核通过',
      returned: '已退回',
      voided: '已作废',
      archived: '已归档'
    }
  });
});

app.listen(PORT, () => {
  console.log(`实验曲线拟合台 服务器已启动: http://localhost:${PORT}`);
});
