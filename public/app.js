let fitChart = null;
let residualChart = null;
let currentResultId = null;
let currentDatasetId = null;
let isDirty = false;

let detailFitChart = null;
let detailResidualChart = null;

let currentBatchFilter = 'all';
let currentSelectedBatchId = null;
let metaInfo = null;

const modelTypeLabels = {
  linear: '线性模型',
  exponential: '指数模型',
  quadratic: '二次曲线'
};

const stateLabelMap = {
  draft: '草稿',
  pending: '待复核',
  approved: '复核通过',
  returned: '已退回',
  voided: '已作废',
  archived: '已归档'
};

const stateBadgeClass = {
  draft: 'status-draft',
  pending: 'status-pending',
  approved: 'status-approved',
  returned: 'status-returned',
  voided: 'status-voided',
  archived: 'status-archived'
};

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.className = `toast ${type} show`;
  toast.textContent = message;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function updateDatasetButtons() {
  const updateBtn = document.getElementById('updateDatasetBtn');
  if (currentDatasetId) {
    updateBtn.style.display = 'block';
    if (isDirty) {
      updateBtn.textContent = '💾 更新当前数据集 *';
    } else {
      updateBtn.textContent = '💾 更新当前数据集';
    }
  } else {
    updateBtn.style.display = 'none';
  }
}

function markDirty() {
  isDirty = true;
  updateDatasetButtons();
}

function clearDirty() {
  isDirty = false;
  updateDatasetButtons();
}

function initCharts() {
  const fitCtx = document.getElementById('fitChart').getContext('2d');
  const residualCtx = document.getElementById('residualChart').getContext('2d');

  fitChart = new Chart(fitCtx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: '原始数据',
          data: [],
          backgroundColor: '#3b82f6',
          borderColor: '#3b82f6',
          pointRadius: 7,
          pointHoverRadius: 9,
          showLine: false
        },
        {
          label: '拟合曲线',
          data: [],
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          showLine: true,
          tension: 0.1,
          fill: false
        },
        {
          label: '异常点',
          data: [],
          backgroundColor: '#f59e0b',
          borderColor: '#d97706',
          pointRadius: 9,
          pointStyle: 'triangle',
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const x = context.parsed.x?.toFixed(4) || 0;
              const y = context.parsed.y?.toFixed(4) || 0;
              return `(${x}, ${y})`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { font: { size: 12 }, color: '#64748b' },
          title: { display: true, text: 'X 轴', font: { size: 13, weight: '600' }, color: '#475569' }
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { font: { size: 12 }, color: '#64748b' },
          title: { display: true, text: 'Y 轴', font: { size: 13, weight: '600' }, color: '#475569' }
        }
      }
    }
  });

  residualChart = new Chart(residualCtx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: '残差',
          data: [],
          backgroundColor: '#8b5cf6',
          borderColor: '#8b5cf6',
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        },
        {
          label: '零参考线',
          data: [],
          borderColor: '#10b981',
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          showLine: true,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                const x = context.parsed.x?.toFixed(4) || 0;
                const y = context.parsed.y?.toFixed(6) || 0;
                return `x=${x}, 残差=${y}`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { font: { size: 12 }, color: '#64748b' },
          title: { display: true, text: 'X 轴', font: { size: 13, weight: '600' }, color: '#475569' }
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { font: { size: 12 }, color: '#64748b' },
          title: { display: true, text: '残差 (观测值 - 预测值)', font: { size: 13, weight: '600' }, color: '#475569' }
        }
      }
    }
  });
}

function initDetailCharts() {
  const fitCtx = document.getElementById('detailFitChart');
  const residualCtx = document.getElementById('detailResidualChart');
  if (!fitCtx || !residualCtx) return;

  detailFitChart = new Chart(fitCtx.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: '原始数据', data: [], backgroundColor: '#3b82f6', borderColor: '#3b82f6', pointRadius: 5, showLine: false },
        { label: '拟合曲线', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, pointRadius: 0, showLine: true, tension: 0.1, fill: false },
        { label: '异常点', data: [], backgroundColor: '#f59e0b', borderColor: '#d97706', pointRadius: 7, pointStyle: 'triangle', showLine: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { type: 'linear', position: 'bottom', grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { font: { size: 11 }, color: '#64748b' } },
        y: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { font: { size: 11 }, color: '#64748b' } }
      }
    }
  });

  detailResidualChart = new Chart(residualCtx.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        { label: '残差', data: [], backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', pointRadius: 4, showLine: false },
        { label: '零参考线', data: [], borderColor: '#10b981', borderWidth: 2, borderDash: [8, 4], pointRadius: 0, showLine: true, fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { type: 'linear', position: 'bottom', grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { font: { size: 11 }, color: '#64748b' } },
        y: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { font: { size: 11 }, color: '#64748b' } }
      }
    }
  });
}

function addDataRow(x = '', y = '') {
  const tbody = document.getElementById('dataTableBody');
  const rowIndex = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${rowIndex}</td>
    <td><input type="number" step="any" class="x-input" value="${x}" placeholder="X"></td>
    <td><input type="number" step="any" class="y-input" value="${y}" placeholder="Y"></td>
    <td><button class="delete-row-btn" title="删除">✕</button></td>
  `;
  tr.querySelector('.delete-row-btn').addEventListener('click', () => {
    tr.remove();
    updateRowNumbers();
    markDirty();
  });
  tr.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', markDirty);
  });
  tbody.appendChild(tr);
}

function updateRowNumbers() {
  const tbody = document.getElementById('dataTableBody');
  Array.from(tbody.children).forEach((tr, idx) => {
    tr.querySelector('td:first-child').textContent = idx + 1;
  });
}

function clearDataTable() {
  const tbody = document.getElementById('dataTableBody');
  tbody.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    addDataRow();
  }
  currentDatasetId = null;
  currentResultId = null;
  clearDirty();
  resetDisplay();
}

function resetDisplay() {
  document.getElementById('metricR2').textContent = '—';
  document.getElementById('metricMSE').textContent = '—';
  document.getElementById('metricRMSE').textContent = '—';
  document.getElementById('metricMAE').textContent = '—';
  document.getElementById('eqFormula').textContent = '等待拟合...';
  document.getElementById('outliersSection').style.display = 'none';
  document.getElementById('createBatchArea').style.display = 'none';

  if (fitChart) {
    fitChart.data.datasets.forEach(ds => ds.data = []);
    fitChart.update();
  }
  if (residualChart) {
    residualChart.data.datasets.forEach(ds => ds.data = []);
    residualChart.update();
  }
}

function getTableData() {
  const tbody = document.getElementById('dataTableBody');
  const points = [];
  Array.from(tbody.children).forEach(tr => {
    const xInput = tr.querySelector('.x-input');
    const yInput = tr.querySelector('.y-input');
    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y });
    }
  });
  return points;
}

function setTableData(points) {
  const tbody = document.getElementById('dataTableBody');
  tbody.innerHTML = '';
  points.forEach(p => {
    addDataRow(p.x, p.y);
  });
}

function loadSampleData() {
  const samples = [
    { x: 1, y: 2.1 },
    { x: 2, y: 3.8 },
    { x: 3, y: 6.2 },
    { x: 4, y: 7.9 },
    { x: 5, y: 10.3 },
    { x: 6, y: 11.8 },
    { x: 7, y: 14.5 },
    { x: 8, y: 25.0 },
    { x: 9, y: 18.2 },
    { x: 10, y: 20.1 }
  ];
  setTableData(samples);
  document.getElementById('datasetName').value = '示例实验数据';
  currentDatasetId = null;
  currentResultId = null;
  resetDisplay();
  clearDirty();
  showToast('已加载示例数据', 'success');
}

async function performFit() {
  const points = getTableData();
  if (points.length < 2) {
    showToast('请至少输入2个有效数据点', 'error');
    return;
  }

  const modelType = document.querySelector('input[name="modelType"]:checked').value;
  const datasetName = document.getElementById('datasetName').value || '未命名数据集';

  const fitBtn = document.getElementById('fitBtn');
  const originalText = fitBtn.textContent;
  fitBtn.textContent = '⏳ 计算中...';
  fitBtn.disabled = true;

  try {
    const res = await fetch('/api/fit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, modelType, datasetName, datasetId: currentDatasetId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '拟合失败');

    displayFitResult(data);
    currentResultId = data.id;
    document.getElementById('createBatchArea').style.display = 'block';
    showToast('拟合完成！可创建审批批次', 'success');
    loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    fitBtn.textContent = originalText;
    fitBtn.disabled = false;
  }
}

function displayFitResult(result) {
  document.getElementById('metricR2').textContent = result.metrics.rSquared.toFixed(6);
  document.getElementById('metricMSE').textContent = result.metrics.mse.toFixed(6);
  document.getElementById('metricRMSE').textContent = result.metrics.rmse.toFixed(6);
  document.getElementById('metricMAE').textContent = result.metrics.mae.toFixed(6);
  document.getElementById('eqFormula').textContent = result.modelEquation;

  const normalPoints = [];
  const outlierPoints = [];
  const outlierIndices = new Set(result.outliers.filter(o => o.isOutlier).map(o => o.index));

  result.points.forEach((p, i) => {
    if (outlierIndices.has(i)) {
      outlierPoints.push(p);
    } else {
      normalPoints.push(p);
    }
  });

  fitChart.data.datasets[0].data = normalPoints;
  fitChart.data.datasets[1].data = result.curvePoints;
  fitChart.data.datasets[2].data = outlierPoints;
  fitChart.update();

  const residualData = result.points.map((p, i) => ({
    x: p.x,
    y: result.residuals[i]
  }));

  const xs = result.points.map(p => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const range = maxX - minX || 1;
  const zeroLine = [
    { x: minX - range * 0.1, y: 0 },
    { x: maxX + range * 0.1, y: 0 }
  ];

  residualChart.data.datasets[0].data = residualData;
  residualChart.data.datasets[1].data = zeroLine;
  residualChart.update();

  const outliersSection = document.getElementById('outliersSection');
  const outliersList = document.getElementById('outliersList');
  const actualOutliers = result.outliers.filter(o => o.isOutlier);

  if (actualOutliers.length > 0) {
    outliersSection.style.display = 'block';
    outliersList.innerHTML = actualOutliers.map(o => `
      <span class="outlier-badge">
        #${o.index + 1} (x=${result.points[o.index].x.toFixed(3)}, y=${result.points[o.index].y.toFixed(3)})
        Z=${o.zScore.toFixed(2)}
      </span>
    `).join('');
  } else {
    outliersSection.style.display = 'none';
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    const historyList = document.getElementById('historyList');

    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-state">暂无历史记录</div>';
      return;
    }

    historyList.innerHTML = history.map(h => `
      <div class="history-item" data-id="${h.id}">
        <div class="history-title">${h.datasetName}</div>
        <span class="history-model">${modelTypeLabels[h.modelType] || h.modelType}</span>
        <div class="history-meta">
          <span>${h.pointsCount} 个点 · R²=${h.metrics.rSquared.toFixed(4)}</span>
          <span>${new Date(h.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="history-actions">
          <button class="btn-load" onclick="loadHistoryItem('${h.id}')">查看</button>
          <button class="btn-delete" onclick="deleteHistoryItem('${h.id}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载历史失败:', err);
  }
}

async function loadHistoryItem(id) {
  try {
    const res = await fetch(`/api/history/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('datasetName').value = data.datasetName;
    document.querySelector(`input[name="modelType"][value="${data.modelType}"]`).checked = true;
    setTableData(data.points);
    displayFitResult(data);
    currentResultId = id;
    currentDatasetId = data.datasetId || null;
    document.getElementById('createBatchArea').style.display = 'block';
    clearDirty();
    showToast('已加载历史记录', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteHistoryItem(id) {
  if (!confirm('确定删除这条历史记录吗？')) return;
  try {
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');
    if (currentResultId === id) {
      currentResultId = null;
    }
    showToast('已删除', 'success');
    loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadDatasets() {
  try {
    const res = await fetch('/api/datasets');
    const datasets = await res.json();
    const datasetsList = document.getElementById('datasetsList');

    if (datasets.length === 0) {
      datasetsList.innerHTML = '<div class="empty-state">暂无保存的数据集</div>';
      return;
    }

    datasetsList.innerHTML = datasets.map(d => `
      <div class="dataset-item" data-id="${d.id}">
        <div class="history-title">${d.name}</div>
        <div class="history-meta">
          <span>${d.points.length} 个点</span>
          <span>${new Date(d.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="history-actions">
          <button class="btn-load" onclick="loadDataset('${d.id}')">加载</button>
          <button class="btn-delete" onclick="deleteDataset('${d.id}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载数据集失败:', err);
  }
}

async function saveCurrentDataset() {
  const points = getTableData();
  const name = document.getElementById('datasetName').value || '未命名数据集';

  if (points.length < 2) {
    showToast('请至少输入2个有效数据点', 'error');
    return;
  }

  try {
    const res = await fetch('/api/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, points })
    });
    if (!res.ok) throw new Error('保存失败');
    const dataset = await res.json();
    currentDatasetId = dataset.id;
    clearDirty();
    showToast('已另存为新数据集', 'success');
    loadDatasets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateCurrentDataset() {
  if (!currentDatasetId) {
    showToast('没有可更新的数据集，请先加载或另存为', 'error');
    return;
  }

  const points = getTableData();
  const name = document.getElementById('datasetName').value || '未命名数据集';

  if (points.length < 2) {
    showToast('请至少输入2个有效数据点', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/datasets/${currentDatasetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, points })
    });
    if (!res.ok) throw new Error('更新失败');
    clearDirty();
    showToast('数据集已更新', 'success');
    loadDatasets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadDataset(id) {
  try {
    const res = await fetch('/api/datasets');
    const datasets = await res.json();
    const dataset = datasets.find(d => d.id === id);
    if (!dataset) throw new Error('数据集不存在');

    document.getElementById('datasetName').value = dataset.name;
    setTableData(dataset.points);
    currentDatasetId = id;
    currentResultId = null;
    resetDisplay();
    clearDirty();
    showToast('已加载数据集', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteDataset(id) {
  if (!confirm('确定删除这个数据集吗？')) return;
  try {
    const res = await fetch(`/api/datasets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');
    if (currentDatasetId === id) {
      currentDatasetId = null;
      updateDatasetButtons();
    }
    showToast('已删除', 'success');
    loadDatasets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.getElementById('tab-history').style.display = tab === 'history' ? 'block' : 'none';
      document.getElementById('tab-datasets').style.display = tab === 'datasets' ? 'block' : 'none';
    });
  });
}

function initModuleNav() {
  const moduleBtns = document.querySelectorAll('.module-btn');
  moduleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const module = btn.dataset.module;
      moduleBtns.forEach(b => b.classList.toggle('active', b.dataset.module === module));
      document.getElementById('module-lab').style.display = module === 'lab' ? 'block' : 'none';
      document.getElementById('module-approval').style.display = module === 'approval' ? 'block' : 'none';
      if (module === 'approval') {
        loadBatches();
        setTimeout(() => {
          initDetailCharts();
        }, 100);
      }
    });
  });
}

function initBatchFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentBatchFilter = btn.dataset.filter;
      filterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === currentBatchFilter));
      loadBatches();
    });
  });
}

async function loadMetaInfo() {
  try {
    const res = await fetch('/api/meta/states');
    metaInfo = await res.json();
  } catch (err) {
    console.error('加载元数据失败:', err);
  }
}

async function loadBatches() {
  try {
    const url = currentBatchFilter === 'all' ? '/api/batches' : `/api/batches?state=${currentBatchFilter}`;
    const res = await fetch(url);
    const batches = await res.json();
    renderBatchList(batches);
    updateBatchCounts();
  } catch (err) {
    console.error('加载批次失败:', err);
  }
}

async function updateBatchCounts() {
  try {
    const res = await fetch('/api/batches');
    const all = await res.json();
    document.getElementById('countAll').textContent = all.length;
    document.getElementById('countDraft').textContent = all.filter(b => b.state === 'draft').length;
    document.getElementById('countPending').textContent = all.filter(b => b.state === 'pending').length;
    document.getElementById('countApproved').textContent = all.filter(b => b.state === 'approved').length;
    document.getElementById('countReturned').textContent = all.filter(b => b.state === 'returned').length;
    document.getElementById('countVoided').textContent = all.filter(b => b.state === 'voided').length;
    document.getElementById('countArchived').textContent = all.filter(b => b.state === 'archived').length;
  } catch (err) {
    console.error('更新计数失败:', err);
  }
}

function renderBatchList(batches) {
  const list = document.getElementById('batchList');
  if (batches.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无符合条件的批次</div>';
    return;
  }
  list.innerHTML = batches.map(b => `
    <div class="batch-list-item ${currentSelectedBatchId === b.id ? 'selected' : ''}" data-id="${b.id}" onclick="selectBatch('${b.id}')">
      <div class="batch-list-header">
        <span class="batch-list-title">${b.title}</span>
        <span class="status-badge ${stateBadgeClass[b.state] || ''}">${stateLabelMap[b.state] || b.state}</span>
      </div>
      <div class="batch-list-meta">
        <span class="batch-no-mini">${b.batchNo}</span>
      </div>
      <div class="batch-list-info">
        <span>${modelTypeLabels[b.modelType] || b.modelType}</span>
        <span>R²=${b.rSquared ? b.rSquared.toFixed(4) : '—'}</span>
      </div>
      <div class="batch-list-footer">
        <span>${b.submitter || '未指定'}</span>
        <span>${formatDate(b.updatedAt || b.createdAt)}</span>
      </div>
    </div>
  `).join('');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function selectBatch(id) {
  currentSelectedBatchId = id;
  try {
    const res = await fetch(`/api/batches/${id}`);
    const batch = await res.json();
    if (!res.ok) throw new Error(batch.error);
    renderBatchDetail(batch);
    loadBatches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBatchDetail(batch) {
  document.getElementById('batchDetailEmpty').style.display = 'none';
  document.getElementById('batchDetail').style.display = 'block';

  document.getElementById('detailTitle').textContent = batch.title;
  document.getElementById('detailBatchNo').textContent = batch.batchNo;
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = stateLabelMap[batch.state] || batch.state;
  statusEl.className = `status-badge ${stateBadgeClass[batch.state] || ''}`;
  document.getElementById('detailTime').textContent = `创建: ${formatDate(batch.createdAt)}`;

  document.getElementById('detailSubmitter').textContent = batch.submitter || '—';
  document.getElementById('detailReviewer').textContent = batch.reviewer || '—';
  document.getElementById('detailDataset').textContent = batch.fitResult?.datasetName || '—';
  document.getElementById('detailModel').textContent = modelTypeLabels[batch.fitResult?.modelType] || batch.fitResult?.modelType || '—';

  renderDetailActions(batch);
  renderFitMetrics(batch.fitResult);
  renderDetailCharts(batch.fitResult);
  renderReviewOpinion(batch);
  renderModificationNotes(batch);
  renderStateTimeline(batch.stateHistory);
}

function renderDetailActions(batch) {
  const container = document.getElementById('detailActions');
  const state = batch.state;
  let buttons = [];

  switch (state) {
    case 'draft':
      buttons.push(`<button class="btn btn-success" onclick="openSubmitModal('${batch.id}')">⏳ 提交复核</button>`);
      buttons.push(`<button class="btn btn-danger" onclick="deleteBatch('${batch.id}')">🗑 删除</button>`);
      break;
    case 'pending':
      buttons.push(`<button class="btn btn-primary" onclick="openReviewModal('${batch.id}')">🔍 开始复核</button>`);
      break;
    case 'approved':
      buttons.push(`<button class="btn btn-success" onclick="openArchiveModal('${batch.id}')">📦 立即归档</button>`);
      break;
    case 'returned':
      buttons.push(`<button class="btn btn-primary" onclick="openRefitModal('${batch.id}')">🔄 重新拟合</button>`);
      buttons.push(`<button class="btn btn-danger" onclick="deleteBatch('${batch.id}')">🗑 删除</button>`);
      break;
    case 'voided':
    case 'archived':
      buttons.push(`<span style="color:#94a3b8;font-size:12px;padding:6px 10px;">流程已结束</span>`);
      break;
  }

  container.innerHTML = buttons.join('');
}

function renderFitMetrics(fitResult) {
  if (!fitResult) return;
  const m = fitResult.metrics || {};
  document.getElementById('fitMetrics').innerHTML = `
    <div class="metric-item-box"><div class="metric-box-label">R²</div><div class="metric-box-value">${m.rSquared ? m.rSquared.toFixed(6) : '—'}</div></div>
    <div class="metric-item-box"><div class="metric-box-label">MSE</div><div class="metric-box-value">${m.mse ? m.mse.toFixed(6) : '—'}</div></div>
    <div class="metric-item-box"><div class="metric-box-label">RMSE</div><div class="metric-box-value">${m.rmse ? m.rmse.toFixed(6) : '—'}</div></div>
    <div class="metric-item-box"><div class="metric-box-label">MAE</div><div class="metric-box-value">${m.mae ? m.mae.toFixed(6) : '—'}</div></div>
  `;
  document.getElementById('detailEquation').textContent = fitResult.modelEquation || '—';
}

function renderDetailCharts(fitResult) {
  if (!fitResult || !detailFitChart || !detailResidualChart) return;

  const outlierIndices = new Set((fitResult.outliers || []).filter(o => o.isOutlier).map(o => o.index));
  const normalPoints = [];
  const outlierPoints = [];
  (fitResult.points || []).forEach((p, i) => {
    if (outlierIndices.has(i)) outlierPoints.push(p);
    else normalPoints.push(p);
  });

  detailFitChart.data.datasets[0].data = normalPoints;
  detailFitChart.data.datasets[1].data = fitResult.curvePoints || [];
  detailFitChart.data.datasets[2].data = outlierPoints;
  detailFitChart.update();

  const residualData = (fitResult.points || []).map((p, i) => ({
    x: p.x, y: (fitResult.residuals || [])[i] || 0
  }));
  const xs = (fitResult.points || []).map(p => p.x);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const range = maxX - minX || 1;
  detailResidualChart.data.datasets[0].data = residualData;
  detailResidualChart.data.datasets[1].data = [
    { x: minX - range * 0.1, y: 0 },
    { x: maxX + range * 0.1, y: 0 }
  ];
  detailResidualChart.update();
}

function renderReviewOpinion(batch) {
  const section = document.getElementById('reviewOpinionSection');
  const box = document.getElementById('reviewOpinionBox');
  if (!batch.reviewOpinion) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  const opinion = batch.reviewOpinion;
  const decisionLabels = { approved: '✅ 复核通过', returned: '↩️ 退回修改', voided: '❌ 作废' };
  box.innerHTML = `
    <div class="opinion-header">
      <span class="opinion-decision ${stateBadgeClass[opinion.decision] || ''}">${decisionLabels[opinion.decision] || opinion.decision}</span>
      <span class="opinion-meta">
        复核人: <strong>${opinion.reviewer}</strong> · ${formatDate(opinion.timestamp)}
      </span>
    </div>
    ${opinion.comment ? `<div class="opinion-comment">${opinion.comment}</div>` : ''}
  `;
}

function renderModificationNotes(batch) {
  const section = document.getElementById('modificationSection');
  const list = document.getElementById('modificationList');
  if (!batch.modificationNotes || batch.modificationNotes.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  list.innerHTML = batch.modificationNotes.map((note, idx) => `
    <div class="modification-item">
      <div class="modification-header">
        <span class="modification-index">第 ${idx + 1} 次修改</span>
        <span class="modification-meta">${note.operator} · ${formatDate(note.timestamp)}</span>
      </div>
      <div class="modification-note-text">${note.note}</div>
      <div class="modification-compare">
        <div class="modification-compare-item old">
          <div class="compare-label">修改前</div>
          <div class="compare-eq">${note.oldFitResult?.modelEquation || '—'}</div>
          <div class="compare-r2">R²=${note.oldFitResult?.rSquared ? note.oldFitResult.rSquared.toFixed(4) : '—'}</div>
        </div>
        <div class="modification-arrow">→</div>
        <div class="modification-compare-item new">
          <div class="compare-label">修改后</div>
          <div class="compare-eq">${note.newFitResult?.modelEquation || '—'}</div>
          <div class="compare-r2">R²=${note.newFitResult?.rSquared ? note.newFitResult.rSquared.toFixed(4) : '—'}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderStateTimeline(history) {
  const container = document.getElementById('stateTimeline');
  if (!history || history.length === 0) {
    container.innerHTML = '<div class="empty-state-small">暂无流转记录</div>';
    return;
  }
  container.innerHTML = history.map((entry, idx) => {
    const isLast = idx === history.length - 1;
    const stateText = stateLabelMap[entry.state] || entry.state;
    const fromText = entry.fromState ? `（由 ${stateLabelMap[entry.fromState] || entry.fromState}）` : '';
    return `
      <div class="timeline-item">
        <div class="timeline-dot ${stateBadgeClass[entry.state] || ''}">${isLast ? '●' : '○'}</div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-state">${stateText}</span>
            <span class="timeline-from">${fromText}</span>
            <span class="timeline-time">${formatDate(entry.timestamp)}</span>
          </div>
          <div class="timeline-operator">操作人：${entry.operator || '系统'}</div>
          <div class="timeline-comment">${entry.comment || ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

async function openCreateBatchModal(preselectedFitId = null) {
  document.getElementById('newBatchTitle').value = '';
  document.getElementById('newBatchSubmitter').value = '实验员';
  await populateFitSelector('newBatchFitSelector', preselectedFitId);
  if (preselectedFitId) {
    const sel = document.querySelector(`input[name="newBatchFitId"][value="${preselectedFitId}"]`);
    if (sel) sel.checked = true;
  }
  openModal('modalCreateBatch');
}

async function openSubmitModal(id) {
  const res = await fetch(`/api/batches/${id}`);
  const batch = await res.json();
  document.getElementById('submitBatchName').textContent = batch.title;
  document.getElementById('submitBatchSubmitter').value = batch.submitter || '';
  window._pendingBatchId = id;
  openModal('modalSubmitBatch');
}

async function confirmSubmitBatch() {
  const id = window._pendingBatchId;
  const submitter = document.getElementById('submitBatchSubmitter').value.trim();
  if (!submitter) { showToast('请填写提交人', 'error'); return; }
  try {
    const res = await fetch(`/api/batches/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submitter })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    closeModal('modalSubmitBatch');
    showToast('已提交复核', 'success');
    await selectBatch(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openReviewModal(id) {
  const res = await fetch(`/api/batches/${id}`);
  const batch = await res.json();
  document.getElementById('reviewBatchName').textContent = batch.title;
  document.getElementById('reviewReviewer').value = '复核人';
  document.getElementById('reviewComment').value = '';
  document.querySelectorAll('input[name="reviewDecision"]').forEach(r => r.checked = false);
  window._pendingBatchId = id;
  openModal('modalReviewBatch');
}

async function confirmReviewBatch() {
  const id = window._pendingBatchId;
  const reviewer = document.getElementById('reviewReviewer').value.trim();
  const decisionEl = document.querySelector('input[name="reviewDecision"]:checked');
  const comment = document.getElementById('reviewComment').value.trim();
  if (!reviewer) { showToast('请填写复核人', 'error'); return; }
  if (!decisionEl) { showToast('请选择复核决定', 'error'); return; }
  try {
    const res = await fetch(`/api/batches/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: decisionEl.value, reviewer, comment })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    closeModal('modalReviewBatch');
    showToast('复核意见已提交', 'success');
    await selectBatch(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openRefitModal(id) {
  const res = await fetch(`/api/batches/${id}`);
  const batch = await res.json();
  document.getElementById('refitBatchName').textContent = batch.title;
  document.getElementById('refitNote').value = '';
  document.getElementById('refitSubmitter').value = batch.submitter || '实验员';
  await populateFitSelector('refitFitSelector', null, batch.fitResultId);
  window._pendingBatchId = id;
  openModal('modalRefitBatch');
}

async function confirmRefitBatch() {
  const id = window._pendingBatchId;
  const note = document.getElementById('refitNote').value.trim();
  const submitter = document.getElementById('refitSubmitter').value.trim();
  const fitIdEl = document.querySelector('input[name="refitFitId"]:checked');
  if (!note) { showToast('请填写修改说明', 'error'); return; }
  if (!fitIdEl) { showToast('请选择新的拟合结果', 'error'); return; }
  try {
    const res = await fetch(`/api/batches/${id}/refit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modificationNote: note, submitter, fitResultId: fitIdEl.value })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    closeModal('modalRefitBatch');
    showToast('已保存修改，回到草稿状态', 'success');
    await selectBatch(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openArchiveModal(id) {
  const res = await fetch(`/api/batches/${id}`);
  const batch = await res.json();
  document.getElementById('archiveBatchName').textContent = batch.title;
  window._pendingBatchId = id;
  openModal('modalArchiveBatch');
}

async function confirmArchiveBatch() {
  const id = window._pendingBatchId;
  try {
    const res = await fetch(`/api/batches/${id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: '系统' })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    closeModal('modalArchiveBatch');
    showToast('已归档', 'success');
    await selectBatch(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function populateFitSelector(containerId, preselectedId = null, excludeId = null) {
  const container = document.getElementById(containerId);
  try {
    const res = await fetch('/api/history');
    const history = await res.json();
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state-small">暂无拟合结果，请先在拟合实验台中执行拟合</div>';
      return;
    }
    const filtered = excludeId ? history.filter(h => h.id !== excludeId) : history;
    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state-small">暂无其他拟合结果</div>';
      return;
    }
    const radioName = containerId === 'newBatchFitSelector' ? 'newBatchFitId' : 'refitFitId';
    container.innerHTML = filtered.map((h, idx) => {
      const checked = preselectedId === h.id ? 'checked' : (!preselectedId && idx === 0 ? 'checked' : '');
      return `
        <label class="fit-option">
          <input type="radio" name="${radioName}" value="${h.id}" ${checked}>
          <div class="fit-option-info">
            <div class="fit-option-title">${h.datasetName}</div>
            <div class="fit-option-meta">
              <span class="history-model-mini">${modelTypeLabels[h.modelType] || h.modelType}</span>
              <span>${h.pointsCount} 点</span>
              <span>R²=${h.metrics.rSquared.toFixed(4)}</span>
              <span>${formatDate(h.createdAt)}</span>
            </div>
            <div class="fit-option-eq">${h.modelEquation}</div>
          </div>
        </label>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state-small">加载失败</div>';
  }
}

async function submitCreateBatch() {
  const title = document.getElementById('newBatchTitle').value.trim();
  const submitter = document.getElementById('newBatchSubmitter').value.trim();
  const fitIdEl = document.querySelector('input[name="newBatchFitId"]:checked');
  if (!title) { showToast('请输入批次标题', 'error'); return; }
  if (!fitIdEl) { showToast('请选择拟合结果', 'error'); return; }
  try {
    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, submitter, fitResultId: fitIdEl.value })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    const batch = await res.json();
    closeModal('modalCreateBatch');
    showToast('批次草稿已创建', 'success');
    currentSelectedBatchId = batch.id;
    await loadBatches();
    await selectBatch(batch.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteBatch(id) {
  if (!confirm('确定删除此批次？仅草稿或退回状态可删除。')) return;
  try {
    const res = await fetch(`/api/batches/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    if (currentSelectedBatchId === id) {
      currentSelectedBatchId = null;
      document.getElementById('batchDetailEmpty').style.display = 'block';
      document.getElementById('batchDetail').style.display = 'none';
    }
    showToast('已删除', 'success');
    await loadBatches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function initEventListeners() {
  document.getElementById('addRowBtn').addEventListener('click', () => {
    addDataRow();
    markDirty();
  });
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (confirm('确定清空所有数据吗？')) clearDataTable();
  });
  document.getElementById('loadSampleBtn').addEventListener('click', loadSampleData);
  document.getElementById('fitBtn').addEventListener('click', performFit);
  document.getElementById('saveDatasetBtn').addEventListener('click', saveCurrentDataset);
  document.getElementById('updateDatasetBtn').addEventListener('click', updateCurrentDataset);
  document.getElementById('datasetName').addEventListener('input', markDirty);
  document.getElementById('createBatchBtn').addEventListener('click', () => {
    openCreateBatchModal(currentResultId);
  });
  document.getElementById('newBatchFromFitBtn').addEventListener('click', () => {
    openCreateBatchModal(currentResultId);
  });
}

function init() {
  initCharts();
  initTabs();
  initModuleNav();
  initBatchFilters();
  initEventListeners();
  clearDataTable();
  loadHistory();
  loadDatasets();
  loadMetaInfo();
  updateDatasetButtons();
}

document.addEventListener('DOMContentLoaded', init);
