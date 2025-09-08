// ==UserScript==
// @name         Webpack Module Probe (通用函数定位器)
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  自动扫描 Webpack 模块，找出符合条件的对象并挂到 window.__probeHits__
// @author       kamjin3086
// @license      MIT
// @match        *://*/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

/*--------------------------------------------------
 0. 全局配置
--------------------------------------------------*/
const PROBE_CONFIG = {
    delay: 2000,            // 延迟扫描 (ms)
    exposeVar: '__probeHits__',
    badgeRight: 20,
    badgeBottom: 20,
    maxRetries: 10,         // 减少重试次数
    retryInterval: 2000     // 增加重试间隔
  };
  
  /*--------------------------------------------------
   1. 搜索条件管理
  --------------------------------------------------*/
  const STORAGE_KEY = 'probeExprs';
  function loadExprs() {
    return GM_getValue(STORAGE_KEY, ['mod.decryptFile', 'mod.encrypt', 'mod.decode']);   // 默认条件
  }
  function saveExprs(arr) { GM_setValue(STORAGE_KEY, arr); }
  
  // 获取当前面板中的搜索条件
  function getCurrentExprs() {
    if (!mainPanel) return loadExprs();
  
    const inputs = mainPanel.querySelectorAll('#probe-search-items input');
    return Array.from(inputs).map(input => input.value.trim()).filter(Boolean);
  }
  
  function makeFinder(exprs = null) {
    const searchExprs = exprs || getCurrentExprs();
    const body  = searchExprs.map(e => `try{if(${e})return true;}catch{}`).join(';');
    return new Function('mod', body + ';return false;');
  }
  
  /*--------------------------------------------------
   2. 控制台美化工具
  --------------------------------------------------*/
  const Console = {
    // 控制台样式
    styles: {
      header: 'color: #667eea; font-weight: bold; font-size: 14px;',
      success: 'color: #28a745; font-weight: bold;',
      warning: 'color: #ffc107; font-weight: bold;',
      error: 'color: #dc3545; font-weight: bold;',
      info: 'color: #17a2b8; font-weight: bold;',
      module: 'color: #6f42c1; font-weight: bold;',
      function: 'color: #e83e8c; font-weight: bold;',
      separator: 'color: #6c757d; font-size: 12px;'
    },
  
    // 打印分隔线
    separator: (text = '') => {
      console.log(`%c${'='.repeat(50)} ${text} ${'='.repeat(50)}`, Console.styles.separator);
    },
  
    // 打印标题
    header: (text) => {
      console.log(`%c🔍 ${text}`, Console.styles.header);
    },
  
    // 打印成功信息
    success: (text) => {
      console.log(`%c✅ ${text}`, Console.styles.success);
    },
  
    // 打印警告信息
    warning: (text) => {
      console.log(`%c⚠️ ${text}`, Console.styles.warning);
    },
  
    // 打印错误信息
    error: (text) => {
      console.log(`%c❌ ${text}`, Console.styles.error);
    },
  
    // 打印信息
    info: (text) => {
      console.log(`%cℹ️ ${text}`, Console.styles.info);
    },
  
    // 打印模块信息
    module: (id, mod) => {
      console.log(`%c📦 模块 ${id}:`, Console.styles.module);
      console.log(mod);
  
      // 尝试提取函数名
      const functions = [];
      try {
        for (const key in mod) {
          if (typeof mod[key] === 'function') {
            functions.push(key);
          }
        }
        if (functions.length > 0) {
          console.log(`%c🔧 包含函数: ${functions.join(', ')}`, Console.styles.function);
        }
      } catch (e) {
        // 忽略错误
      }
    },
  
    // 打印使用说明
    usage: (hits) => {
      Console.separator('使用说明');
      console.log(`%c 找到 ${hits.length} 个匹配的模块`, Console.styles.success);
      console.log(`%c 使用方法:`, Console.styles.info);
      console.log(`%c   window.__probeHits__[0].mod  // 获取第一个模块`, Console.styles.info);
      console.log(`%c   window.__probeHits__[1].mod  // 获取第二个模块`, Console.styles.info);
      console.log(`%c   // 以此类推...`, Console.styles.info);
      console.log(`%c🔍 查看所有结果:`, Console.styles.info);
      console.log(`%c   window.__probeHits__`, Console.styles.info);
      Console.separator();
    }
  };
  
  /*--------------------------------------------------
   3. 菜单注册
  --------------------------------------------------*/
  function initMenus() {
    GM_registerMenuCommand('🔍 打开搜索面板', toggleMainPanel);
    GM_registerMenuCommand('📖 使用说明', toggleHelpPanel);
    GM_registerMenuCommand('⚙️ 高级设置', toggleSettingsPanel);
  }
  
  /*--------------------------------------------------
   4. 主搜索面板
  --------------------------------------------------*/
  GM_addStyle(`
  /* 主面板样式 */
  #probe-main-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    max-width: 90vw;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: none;
    backdrop-filter: blur(10px);
  }
  
  #probe-main-panel header {
    background: rgba(255,255,255,0.1);
    color: white;
    padding: 20px;
    border-radius: 16px 16px 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
    backdrop-filter: blur(10px);
  }
  
  #probe-main-panel .title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
  
  #probe-main-panel .close-btn {
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  #probe-main-panel .close-btn:hover {
    background: rgba(255,255,255,0.3);
    transform: scale(1.1);
  }
  
  #probe-main-panel .body {
    padding: 24px;
    background: white;
    border-radius: 0 0 16px 16px;
  }
  
  /* 搜索条件区域 */
  .search-section {
    margin-bottom: 24px;
  }
  
  .search-section h3 {
    color: #333;
    font-size: 16px;
    margin: 0 0 12px 0;
    font-weight: 600;
  }
  
  .search-item {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all 0.2s;
  }
  
  .search-item:hover {
    border-color: #e9ecef;
    background: #f1f3f4;
  }
  
  .search-item input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    color: #333;
    transition: border-color 0.2s;
  }
  
  .search-item input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
  
  .search-item .del-btn {
    margin-left: 12px;
    background: #ff4757;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }
  
  .search-item .del-btn:hover {
    background: #ff3742;
    transform: translateY(-1px);
  }
  
  /* 按钮区域 */
  .button-section {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  
  .btn {
    padding: 12px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }
  
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
  }
  
  .btn-secondary {
    background: #6c757d;
    color: white;
  }
  
  .btn-secondary:hover {
    background: #5a6268;
    transform: translateY(-1px);
  }
  
  .btn-success {
    background: #28a745;
    color: white;
  }
  
  .btn-success:hover {
    background: #218838;
    transform: translateY(-1px);
  }
  
  /* 状态显示 */
  .status-section {
    margin-top: 20px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #667eea;
  }
  
  .status-title {
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
  }
  
  .status-text {
    color: #666;
    font-size: 14px;
    line-height: 1.5;
  }
  
  /* 快速操作按钮 */
  .quick-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  
  .quick-btn {
    padding: 6px 12px;
    background: #e9ecef;
    border: 1px solid #dee2e6;
    border-radius: 20px;
    cursor: pointer;
    font-size: 12px;
    color: #495057;
    transition: all 0.2s;
  }
  
  .quick-btn:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }
  
  /* 加载动画 */
  .loading {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  `);
  
  let mainPanel = null;
  function createMainPanel() {
    if (mainPanel) return mainPanel;
  
    mainPanel = document.createElement('div');
    mainPanel.id = 'probe-main-panel';
    mainPanel.innerHTML = `
      <header>
        <h3 class="title">🔍 Webpack 模块探测器</h3>
        <button class="close-btn" id="probe-main-close">×</button>
      </header>
      <div class="body">
        <div class="search-section">
          <h3>搜索条件</h3>
          <div class="quick-actions">
            <button class="quick-btn" data-expr="mod.decryptFile">解密函数</button>
            <button class="quick-btn" data-expr="mod.encrypt">加密函数</button>
            <button class="quick-btn" data-expr="mod.decode">解码函数</button>
            <button class="quick-btn" data-expr="mod.sign">签名函数</button>
            <button class="quick-btn" data-expr="mod.request">请求函数</button>
          </div>
          <div id="probe-search-items"></div>
          <button class="btn btn-secondary" id="add-search-btn">+ 添加搜索条件</button>
        </div>
  
        <div class="status-section">
          <div class="status-title"> 当前状态</div>
          <div class="status-text" id="probe-status">等待扫描...</div>
        </div>
  
        <div class="button-section">
          <button class="btn btn-success" id="scan-now-btn">🔍 立即扫描</button>
          <button class="btn btn-primary" id="save-scan-btn">💾 保存并扫描</button>
        </div>
      </div>`;
  
    document.documentElement.appendChild(mainPanel);
  
    // 绑定事件
    mainPanel.querySelector('#probe-main-close').onclick = toggleMainPanel;
    mainPanel.querySelector('#add-search-btn').onclick = addSearchItem;
    mainPanel.querySelector('#scan-now-btn').onclick = () => {
      updateStatus('正在扫描...', '#ffc107');
      setTimeout(scan, 100);
    };
    mainPanel.querySelector('#save-scan-btn').onclick = saveAndScan;
  
    // 快速操作按钮
    mainPanel.querySelectorAll('.quick-btn').forEach(btn => {
      btn.onclick = () => {
        const expr = btn.dataset.expr;
        addSearchItem(expr);
      };
    });
  
    // 初始化搜索项
    buildSearchItems();
  
    drag(mainPanel);
    return mainPanel;
  }
  
  function toggleMainPanel() {
    const panel = createMainPanel();
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    if (panel.style.display === 'block') {
      buildSearchItems();
      updateStatus('准备就绪，点击"立即扫描"开始', '#28a745');
    }
  }
  
  function buildSearchItems() {
    const container = mainPanel.querySelector('#probe-search-items');
    container.innerHTML = '';
    loadExprs().forEach(expr => addSearchItem(expr));
    if (!container.children.length) {
      addSearchItem('mod.decryptFile');
    }
  }
  
  function addSearchItem(value = '') {
    const container = mainPanel.querySelector('#probe-search-items');
    const item = document.createElement('div');
    item.className = 'search-item';
    item.innerHTML = `
      <input type="text" placeholder="例如: mod.decryptFile" value="${value.replace(/"/g, '&quot;')}">
      <button class="del-btn">删除</button>
    `;
  
    item.querySelector('.del-btn').onclick = () => item.remove();
    container.appendChild(item);
  }
  
  function saveAndScan() {
    const inputs = mainPanel.querySelectorAll('#probe-search-items input');
    const exprs = Array.from(inputs).map(input => input.value.trim()).filter(Boolean);
  
    if (exprs.length === 0) {
      alert('请至少添加一个搜索条件！');
      return;
    }
  
    saveExprs(exprs);
    updateStatus('已保存，正在扫描...', '#ffc107');
    setTimeout(scan, 100);
  }
  
  function updateStatus(text, color = '#333') {
    const statusEl = mainPanel?.querySelector('#probe-status');
    if (statusEl) {
      statusEl.innerHTML = text;
      statusEl.style.color = color;
    }
  }
  
  /*--------------------------------------------------
   5. 简化的使用说明面板
  --------------------------------------------------*/
  const SIMPLE_HELP_HTML = `
  <div style="color: #333; line-height: 1.6;">
    <h3 style="color: #667eea; margin-top: 0;">🚀 三步搞定</h3>
  
    <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <strong>1️⃣ 设置搜索条件</strong><br>
      在搜索面板中添加你要找的函数，比如 <code>mod.decryptFile</code>
    </div>
  
    <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <strong>2️⃣ 点击"立即扫描"</strong><br>
      等待扫描完成，右下角会显示结果
    </div>
  
    <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <strong>3️⃣ 使用找到的函数</strong><br>
      在控制台输入：<code>window.__probeHits__[0].mod.decryptFile</code>
    </div>
  
    <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-top: 16px; border-left: 4px solid #2196f3;">
      <strong>💡 小贴士：</strong> 如果没找到，试试其他常见的函数名，如 <code>mod.encrypt</code>、<code>mod.decode</code> 等
    </div>
  </div>`;
  
  let helpPanel = null;
  function createHelpPanel() {
    if (helpPanel) return helpPanel;
  
    helpPanel = document.createElement('div');
    helpPanel.id = 'probe-help-panel';
    helpPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 450px;
      max-width: 90vw;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: none;
    `;
  
    helpPanel.innerHTML = `
      <header style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 18px;">📖 使用说明</h3>
        <button id="probe-help-close" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px;">×</button>
      </header>
      <div style="padding: 24px; max-height: 60vh; overflow-y: auto;">
        ${SIMPLE_HELP_HTML}
      </div>
    `;
  
    document.documentElement.appendChild(helpPanel);
    helpPanel.querySelector('#probe-help-close').onclick = toggleHelpPanel;
    drag(helpPanel);
    return helpPanel;
  }
  
  function toggleHelpPanel() {
    const panel = createHelpPanel();
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  }
  
  /*--------------------------------------------------
   6. 高级设置面板
  --------------------------------------------------*/
  let settingsPanel = null;
  function createSettingsPanel() {
    if (settingsPanel) return settingsPanel;
  
    settingsPanel = document.createElement('div');
    settingsPanel.id = 'probe-settings-panel';
    settingsPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: none;
    `;
  
    settingsPanel.innerHTML = `
      <header style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 18px;">⚙️ 高级设置</h3>
        <button id="probe-settings-close" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px;">×</button>
      </header>
      <div style="padding: 24px;">
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">扫描延迟 (毫秒)</label>
          <input type="number" id="scan-delay" value="${PROBE_CONFIG.delay}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
        </div>
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">暴露变量名</label>
          <input type="text" id="expose-var" value="${PROBE_CONFIG.exposeVar}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-secondary" id="reset-settings">重置</button>
          <button class="btn btn-primary" id="save-settings">保存</button>
        </div>
      </div>
    `;
  
    document.documentElement.appendChild(settingsPanel);
    settingsPanel.querySelector('#probe-settings-close').onclick = toggleSettingsPanel;
    settingsPanel.querySelector('#save-settings').onclick = saveSettings;
    settingsPanel.querySelector('#reset-settings').onclick = resetSettings;
    drag(settingsPanel);
    return settingsPanel;
  }
  
  function toggleSettingsPanel() {
    const panel = createSettingsPanel();
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  }
  
  function saveSettings() {
    const delay = parseInt(settingsPanel.querySelector('#scan-delay').value);
    const exposeVar = settingsPanel.querySelector('#expose-var').value;
  
    PROBE_CONFIG.delay = Math.max(1000, delay);
    PROBE_CONFIG.exposeVar = exposeVar || '__probeHits__';
  
    alert('设置已保存！');
    toggleSettingsPanel();
  }
  
  function resetSettings() {
    settingsPanel.querySelector('#scan-delay').value = 2000;
    settingsPanel.querySelector('#expose-var').value = '__probeHits__';
  }
  
  /*--------------------------------------------------
   7. 改进的 Webpack 检测和扫描
  --------------------------------------------------*/
  let wp = null;
  let retryCount = 0;
  let retryTimer = null;
  
  // 安全的属性访问函数
  function safeGet(obj, path) {
    try {
      return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : null;
      }, obj);
    } catch (e) {
      return null;
    }
  }
  
  // 安全的对象遍历
  function safeForIn(obj, callback) {
    try {
      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
            callback(key, obj[key]);
          }
        }
      }
    } catch (e) {
      // 忽略错误
    }
  }
  
  function findWebpackRequire() {
    try {
      // 方法1: 直接查找 __webpack_require__
      if (typeof unsafeWindow.__webpack_require__ === 'function') {
        wp = unsafeWindow.__webpack_require__;
        Console.success('找到 __webpack_require__');
        return true;
      }
  
      // 方法2: 查找 webpackJsonp 或 webpackChunk
      safeForIn(unsafeWindow, (k, v) => {
        if (/^(webpackJsonp|webpackChunk)/.test(k) && Array.isArray(v)) {
          try {
            const fake = 'probe_' + Date.now();
            v.push([[fake], {[fake]: (m, e, r) => {wp = r; flush();}}, [[fake]]]);
            Console.success(`找到 webpack chunk: ${k}`);
            return true;
          } catch (e) {
            // 忽略错误
          }
        }
      });
  
      // 方法3: 查找其他可能的 webpack 相关对象
      safeForIn(unsafeWindow, (k, v) => {
        if (typeof v === 'function' && v.m && v.c) {
          wp = v;
          Console.success(`找到 webpack 函数: ${k}`);
          return true;
        }
      });
  
      // 方法4: 查找 webpack 模块缓存
      safeForIn(unsafeWindow, (k, v) => {
        if (typeof v === 'object' && v && v.__webpack_require__) {
          wp = v.__webpack_require__;
          Console.success(`找到 webpack 对象: ${k}`);
          return true;
        }
      });
  
      return false;
    } catch (e) {
      Console.warning(`检测过程中出错: ${e.message}`);
      return false;
    }
  }
  
  function flush() {
    if (wp) {
      try {
        unsafeWindow.__wp_require__ = wp;
        Console.success('Webpack 检测成功！');
        updateStatus('✅ Webpack 已找到，准备扫描', '#28a745');
      } catch (e) {
        Console.error(`设置 webpack 时出错: ${e.message}`);
      }
    }
  }
  
  function startWebpackDetection() {
    if (wp) {
      updateStatus('✅ Webpack 已找到，准备扫描', '#28a745');
      return;
    }
  
    retryCount = 0;
    updateStatus('🔍 正在检测 Webpack...', '#ffc107');
    Console.header('开始检测 Webpack');
  
    function retry() {
      if (wp) {
        updateStatus('✅ Webpack 已找到，准备扫描', '#28a745');
        return;
      }
  
      if (retryCount >= PROBE_CONFIG.maxRetries) {
        updateStatus('❌ 未找到 Webpack，请确保页面已完全加载', '#dc3545');
        Console.error('未找到 Webpack，请确保页面已完全加载');
        return;
      }
  
      retryCount++;
      updateStatus(`🔍 正在检测 Webpack... (${retryCount}/${PROBE_CONFIG.maxRetries})`, '#ffc107');
      Console.info(`检测尝试 ${retryCount}/${PROBE_CONFIG.maxRetries}`);
  
      // 使用 setTimeout 避免阻塞
      setTimeout(() => {
        if (findWebpackRequire()) {
          flush();
          updateStatus('✅ Webpack 已找到，准备扫描', '#28a745');
        } else {
          retryTimer = setTimeout(retry, PROBE_CONFIG.retryInterval);
        }
      }, 100);
    }
  
    retry();
  }
  
  function scan() {
    if (!wp) {
      updateStatus('❌ 未找到 Webpack，请确保页面已完全加载', '#dc3545');
      startWebpackDetection();
      return;
    }
  
    // 获取当前面板中的搜索条件
    const currentExprs = getCurrentExprs();
  
    Console.separator('开始扫描模块');
    Console.header('扫描配置');
    Console.info(`搜索条件: ${currentExprs.join(', ')}`);
  
    if (currentExprs.length === 0) {
      updateStatus('❌ 请至少添加一个搜索条件', '#dc3545');
      Console.error('请至少添加一个搜索条件');
      return;
    }
  
    const hits = [];
    const finder = makeFinder(currentExprs);
    const repo = wp.m || wp.c;
  
    if (!repo) {
      updateStatus('❌ 未找到 Webpack 模块', '#dc3545');
      Console.error('未找到 Webpack 模块');
      return;
    }
  
    updateStatus('🔍 正在扫描模块...', '#ffc107');
    Console.info('开始扫描模块...');
  
    let scanned = 0;
    const total = Object.keys(repo).length;
    Console.info(`总共需要扫描 ${total} 个模块`);
  
    for (const id in repo) {
      try {
        const exp = wp(id);
        const mod = exp?.default ?? exp;
        if (finder(mod)) {
          hits.push({id, mod});
          Console.module(id, mod);
        }
        scanned++;
      } catch (e) {
        scanned++;
      }
    }
  
    unsafeWindow[PROBE_CONFIG.exposeVar] = hits;
    ui(hits);
  
    if (hits.length > 0) {
      updateStatus(`✅ 扫描完成！找到 ${hits.length} 个匹配的模块`, '#28a745');
      Console.success(`扫描完成！找到 ${hits.length} 个匹配的模块`);
      Console.usage(hits);
    } else {
      updateStatus('❌ 未找到匹配的模块，请检查搜索条件', '#dc3545');
      Console.warning('未找到匹配的模块，请检查搜索条件');
    }
  }
  
  /*--------------------------------------------------
   8. 改进的浮标 UI
  --------------------------------------------------*/
  function ui(hits) {
    const oldBadge = document.getElementById('probe-badge');
    const oldPanel = document.getElementById('probe-panel');
    if (oldBadge) oldBadge.remove();
    if (oldPanel) oldPanel.remove();
  
    GM_addStyle(`
      #probe-badge {
        position: fixed;
        right: ${PROBE_CONFIG.badgeRight}px;
        bottom: ${PROBE_CONFIG.badgeBottom}px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 25px;
        padding: 12px 20px;
        font: 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        transition: all 0.3s;
        font-weight: 600;
      }
  
      #probe-badge:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 25px rgba(102, 126, 234, 0.4);
      }
  
      #probe-panel {
        position: fixed;
        right: ${PROBE_CONFIG.badgeRight}px;
        bottom: ${PROBE_CONFIG.badgeBottom + 60}px;
        background: white;
        color: #333;
        max-height: 300px;
        overflow: auto;
        padding: 16px;
        border-radius: 12px;
        font: 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        white-space: pre;
        display: none;
        z-index: 99999;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        border: 1px solid #e9ecef;
        min-width: 250px;
      }
  
      .probe-item {
        padding: 8px 12px;
        margin: 4px 0;
        background: #f8f9fa;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        border-left: 3px solid #667eea;
      }
  
      .probe-item:hover {
        background: #e9ecef;
        transform: translateX(4px);
      }
    `);
  
    const badge = document.createElement('div');
    badge.id = 'probe-badge';
    badge.textContent = hits.length ? ` 找到 ${hits.length} 个模块` : '❌ 未找到模块';
  
    const panel = document.createElement('div');
    panel.id = 'probe-panel';
  
    if (hits.length > 0) {
      panel.innerHTML = hits.map((h, i) =>
        `<div class="probe-item" data-index="${i}">${i + 1}. 模块ID: ${h.id}</div>`
      ).join('');
    } else {
      panel.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">未找到匹配的模块</div>';
    }
  
    document.documentElement.append(badge, panel);
  
    badge.onclick = () => {
      panel.style.display = panel.style.display ? 'none' : 'block';
    };
  
    panel.onclick = e => {
      const item = e.target.closest('.probe-item');
      if (!item) return;
  
      const idx = parseInt(item.dataset.index);
      const hit = hits[idx];
  
      Console.separator(`模块 ${idx + 1} 详情`);
      Console.module(hit.id, hit.mod);
      Console.info(`使用方法: window.__probeHits__[${idx}].mod`);
  
      // 显示更友好的提示
      const moduleInfo = `模块 ${idx + 1} 已打印到控制台\n\n使用方法:\nwindow.__probeHits__[${idx}].mod\n\n模块ID: ${hit.id}`;
      alert(moduleInfo);
    };
  }
  
  /*--------------------------------------------------
   9. 拖动功能
  --------------------------------------------------*/
  function drag(el) {
    const head = el.querySelector('header');
    if (!head) return;
  
    let dx = 0, dy = 0, active = false;
  
    head.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      active = true;
      const r = el.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      document.body.style.userSelect = 'none';
    });
  
    window.addEventListener('mousemove', e => {
      if (!active) return;
      el.style.left = e.clientX - dx + 'px';
      el.style.top = e.clientY - dy + 'px';
      el.style.right = '';
      el.style.bottom = '';
      el.style.transform = 'none';
    });
  
    window.addEventListener('mouseup', () => {
      active = false;
      document.body.style.userSelect = '';
    });
  }
  
  /*--------------------------------------------------
   10. 初始化
  --------------------------------------------------*/
  function init() {
    initMenus();
  
    // 延迟启动检测，确保页面完全加载
    setTimeout(() => {
      startWebpackDetection();
    }, 2000);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }