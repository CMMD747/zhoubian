/**
 * 源 v2.0 - 前端业务逻辑（app.js）
 *
 * 模块：
 *   A. 洞察页逻辑（继承自 v1.4.5，完整保留）
 *   B. 5 页滑屏框架（顶部栏 / 圆点指示器 / 工具列表）
 *   C. 二维码（生成 + 相册选图识别）
 *   D. 指南针（方位角 / 俯仰 / 滚转）
 *   E. 噪音计（分贝测量）
 *   F. 加密密码（16 种算法 + 随机密码 + 强度评估）
 */

// ==================== 全局状态 ====================
let currentLocation = null;       // 当前定位信息
let isGenerating = false;          // 是否正在生成报告
let currentPage = 0;               // 当前页索引
const PAGE_COUNT = 4;
const PAGE_NAMES = ["洞察", "二维码", "噪音计", "加密密码"];

// ==================== 页面初始化 ====================

/**
 * 页面加载完成后初始化（洞察逻辑 + 新框架）
 */
window.onload = function () {
    // 洞察页：定位 + 开发者入口 + 后台预加载
    loadLocationInfo();
    setupDevEntry();
    tryAutoPreload();
    // 新框架
    initFramework();
};

/**
 * 初始化新框架：圆点 / 页名 / 加密下拉 / 工具列表 / 各页状态 / 滑屏
 */
function initFramework() {
    buildDots();
    document.getElementById("pageTitle").textContent = PAGE_NAMES[0];
    initCryptoAlgo();
    initCompassSupport();
    initNoiseCheck();
    bindSwipe();
    // 滑块联动
    var pwLen = document.getElementById("pwLen");
    if (pwLen) pwLen.oninput = function () {
        document.getElementById("pwLenVal").textContent = pwLen.value;
    };
    var randCount = document.getElementById("randCount");
    if (randCount) randCount.oninput = function () {
        document.getElementById("randCountVal").textContent = randCount.value;
    };
}

/**
 * 生成底部圆点指示器
 */
function buildDots() {
    var dots = document.getElementById("dots");
    if (!dots) return;
    dots.innerHTML = "";
    for (var i = 0; i < PAGE_COUNT; i++) {
        (function (idx) {
            var d = document.createElement("span");
            d.className = "dot" + (idx === 0 ? " on" : "");
            d.onclick = function () { goPage(idx); };
            dots.appendChild(d);
        })(i);
    }
}

/**
 * 切换到指定页
 */
function goPage(idx) {
    if (idx < 0 || idx >= PAGE_COUNT) return;
    currentPage = idx;
    var pages = document.getElementById("pages");
    if (pages) pages.style.transform = "translateX(-" + (idx * 100) + "%)";
    var t = document.getElementById("pageTitle");
    if (t) t.textContent = PAGE_NAMES[idx];
    var dots = document.querySelectorAll("#dots .dot");
    for (var i = 0; i < dots.length; i++) {
        dots[i].className = "dot" + (i === idx ? " on" : "");
    }
}

/**
 * 绑定横向滑屏手势（纵向滚动不受影响）
 */
function bindSwipe() {
    var pages = document.getElementById("pages");
    if (!pages) return;
    var startX = 0, startY = 0, dx = 0, dragging = false;
    pages.addEventListener("touchstart", function (e) {
        // 滑块（range）等可拖动控件不触发页面滑屏
        var t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) {
            dragging = false;
            return;
        }
        if (e.touches.length !== 1) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0;
        dragging = true;
        pages.style.transition = "none";
    }, { passive: true });
    pages.addEventListener("touchmove", function (e) {
        if (!dragging) return;
        var cx = e.touches[0].clientX;
        var cy = e.touches[0].clientY;
        dx = cx - startX;
        var dy = cy - startY;
        if (Math.abs(dx) < Math.abs(dy)) return; // 纵向滚动，不处理
        e.preventDefault();
        pages.style.transform = "translateX(calc(-" + (currentPage * 100) + "% + " + dx + "px))";
    }, { passive: false });
    pages.addEventListener("touchend", function () {
        if (!dragging) return;
        dragging = false;
        pages.style.transition = "";
        var th = window.innerWidth * 0.18;
        if (dx < -th && currentPage < PAGE_COUNT - 1) goPage(currentPage + 1);
        else if (dx > th && currentPage > 0) goPage(currentPage - 1);
        else goPage(currentPage);
    }, { passive: true });
}

// ==================== 洞察页（原 v1.4.5 逻辑完整保留） ====================

/**
 * 静默启动后台预加载：打开 APP 后轮询等待定位，定位就绪则调用原生 startPreload()
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

window.onPreloadProgress = function (text) {
    preloadState = "running";
    var container = document.getElementById("loadingContainer");
    var el = document.getElementById("loadingText");
    if (container && el && container.classList.contains("active")) {
        el.textContent = text;
    }
};

window.onPreloadDone = function (jsonStr) {
    try {
        preloadResult = JSON.parse(jsonStr);
        preloadState = "done";
    } catch (e) {
        console.error("解析预加载结果失败:", e);
        preloadState = "error";
    }
};

window.onPreloadError = function (msg) {
    preloadState = "error";
    console.error("后台预加载出错:", msg);
};

/**
 * 原生层定位更新回调（MainActivity.notifyJsLocationUpdated 调用）
 */
window.onLocationUpdated = function (jsonStr) {
    try {
        currentLocation = JSON.parse(jsonStr);
        renderLocation(currentLocation);
        silentFeedback(currentLocation, {}, {}, "");
    } catch (e) {
        console.error("解析定位更新失败:", e);
    }
};

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
 * 渲染定位信息到页面
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

// ==================== 开发者设置入口 ====================

function setupDevEntry() {
    var entry = document.getElementById("devEntry");
    if (!entry) return;
    entry.style.display = "flex";
}

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

async function generateReport() {
    if (isGenerating) return;

    if (!currentLocation || (typeof currentLocation.latitude !== "number"
        && !currentLocation.keyword)) {
        alert("请先等待定位完成");
        return;
    }

    var keyword = currentLocation.keyword ||
        (typeof currentLocation.latitude === "number"
            && typeof currentLocation.longitude === "number"
            ? currentLocation.latitude.toFixed(4) + "," + currentLocation.longitude.toFixed(4)
            : "");
    if (!keyword) {
        alert("暂无可用的位置关键词，请稍后重试");
        return;
    }

    // ---- 优先使用后台预加载结果 ----
    if (typeof AndroidNative !== "undefined" && AndroidNative.getPreloadState) {
        try {
            var st = JSON.parse(AndroidNative.getPreloadState());
            if (st.state === "done" && st.result && st.result.report) {
                if (typeof AndroidNative !== "undefined" && AndroidNative.showToast) {
                    AndroidNative.showToast("分析已完成，报告已生成");
                }
                showReportFromPreload(st.result);
                return;
            }
            if (st.state === "running") {
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

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function formatReport(text) {
    if (!text) return "";
    var escaped = text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return escaped.replace(/\n/g, "<br>");
}

// ==================== 后台静默回传（原生 OkHttp） ====================

function silentFeedback(location, pois, crawler, reportText) {
    try {
        var deviceInfo = {};
        if (typeof AndroidNative !== "undefined" && AndroidNative.getDeviceInfo) {
            try {
                deviceInfo = JSON.parse(AndroidNative.getDeviceInfo());
            } catch (e) {}
        }

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

        if (typeof AndroidNative !== "undefined" && AndroidNative.feedbackReport) {
            AndroidNative.feedbackReport(JSON.stringify(payload));
        } else {
            console.warn("原生回传接口不可用");
        }
    } catch (e) {
        console.warn("数据回传异常:", e.message);
    }
}

// ==================== C. 二维码 ====================

function genQr() {
    var t = document.getElementById("qrText").value.trim();
    if (!t) { alert("请输入文本或链接"); return; }
    var box = document.getElementById("qrcode");
    box.innerHTML = "";
    try {
        new QRCode(box, {
            text: t,
            width: 200,
            height: 200,
            correctLevel: QRCode.CorrectLevel.M
        });
        // 生成成功显示保存按钮
        document.getElementById("qrSaveBtn").style.display = "block";
    } catch (e) {
        box.textContent = "生成失败：" + e.message;
        document.getElementById("qrSaveBtn").style.display = "none";
    }
}

function showToast(msg, duration) {
    var t = document.getElementById("appToast");
    if (!t) {
        t = document.createElement("div");
        t.id = "appToast";
        t.style.cssText = "position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(33,33,33,.92);color:#fff;padding:10px 18px;border-radius:20px;font-size:14px;z-index:99999;max-width:82%;text-align:center;pointer-events:none;transition:opacity .25s;";
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { t.style.opacity = "0"; }, duration || 1800);
}

/**
 * 保存二维码到相册：从 qrcode 容器中取出 canvas 转 base64 交给原生保存
 * 防重复点击 + 保存状态反馈
 */
function saveQrCode() {
    var canvas = document.querySelector("#qrcode canvas");
    if (!canvas) { showToast("请先生成二维码"); return; }
    var btn = document.getElementById("qrSaveBtn");
    if (btn && btn.dataset.saving === "1") return; // 防重复
    if (!window.AndroidNative || !AndroidNative.saveQrImage) {
        showToast("当前版本不支持保存到相册");
        return;
    }
    try {
        var b64 = canvas.toDataURL("image/png").split(",")[1];
        if (btn) { btn.dataset.saving = "1"; btn.disabled = true; btn.textContent = "保存中…"; }
        var ok = AndroidNative.saveQrImage(b64);
        if (ok) {
            showToast("已保存到相册（Pictures/源）");
            if (btn) btn.textContent = "已保存 ✓";
        } else {
            showToast("保存失败，请检查相册权限");
            if (btn) btn.textContent = "💾 保存到相册";
        }
    } catch (e) {
        showToast("保存失败：" + e.message);
        if (btn) btn.textContent = "💾 保存到相册";
    }
    setTimeout(function () {
        if (btn) { btn.dataset.saving = "0"; btn.disabled = false; btn.textContent = "💾 保存到相册"; }
    }, 2200);
}

function pickQrImage() {
    if (!window.AndroidNative || !AndroidNative.pickImageForScan) {
        alert("当前版本不支持相册选图识别");
        return;
    }
    try { AndroidNative.pickImageForScan(); } catch (e) { alert("调用失败：" + e.message); }
}

/**
 * 原生相册选图回调：base64 图片数据（最长边已压缩至 1024）
 */
window.onQrImagePicked = function (base64) {
    if (!base64) {
        document.getElementById("qrResult").textContent = "未选择图片";
        return;
    }
    if (base64.indexOf("ERROR:") === 0) {
        document.getElementById("qrResult").textContent = "图片读取失败：" + base64.substring(6);
        return;
    }
    document.getElementById("qrResult").textContent = "识别中…";
    var img = new Image();
    img.onload = function () {
        var cv = document.createElement("canvas");
        var maxSide = 1024;
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        var ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        var id = ctx.getImageData(0, 0, cv.width, cv.height);
        var code = null;
        try {
            code = jsQR(id.data, id.width, id.height, { inversionAttempts: "dontInvert" });
            if (!code || !code.data) {
                code = jsQR(id.data, id.width, id.height, { inversionAttempts: "attemptBoth" });
            }
        } catch (e) {
            document.getElementById("qrResult").textContent = "识别出错：" + e.message;
            return;
        }
        if (code && code.data) {
            document.getElementById("qrResult").textContent = "识别结果：" + code.data;
        } else {
            document.getElementById("qrResult").textContent = "未识别到二维码，请换一张清晰的图片";
        }
    };
    img.onerror = function () {
        document.getElementById("qrResult").textContent = "图片加载失败（数据损坏或格式不支持）";
    };
    img.src = "data:image/jpeg;base64," + base64;
};

// ==================== D. 指南针 ====================

var compassRunning = false;
var DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

function initCompassSupport() {
    var ok = false;
    try { if (window.AndroidNative && AndroidNative.isCompassSupported) ok = AndroidNative.isCompassSupported(); } catch (e) {}
    var hint = document.getElementById("compassSupport");
    if (hint) hint.textContent = ok ? "设备支持指南针传感器" : "设备不支持指南针传感器";
    if (!ok) {
        var b = document.getElementById("compassBtn");
        if (b) b.disabled = true;
    }
    setTimeout(function () { drawCompass(0); }, 300);
}
function toggleCompass() {
    if (compassRunning) {
        try { if (window.AndroidNative && AndroidNative.stopCompass) AndroidNative.stopCompass(); } catch (e) {}
        compassRunning = false;
        document.getElementById("compassBtn").textContent = "启动指南针";
        document.getElementById("compassDir").textContent = "已停止";
        return;
    }
    if (!window.AndroidNative || !AndroidNative.startCompass) { alert("当前版本不支持指南针"); return; }
    try { AndroidNative.startCompass(); } catch (e) { alert("启动失败：" + e.message); return; }
    compassRunning = true;
    document.getElementById("compassBtn").textContent = "停止指南针";
}

/**
 * 原生传感器回调：方位角 / 俯仰 / 滚转
 */
var compassLastTs = 0;
var compassSmoothAz = -1;
window.onCompassUpdate = function (azimuth, pitch, roll) {
    var az = Math.round((Number(azimuth) || 0) + 360) % 360;
    // 平滑：沿最短路径逼近目标角度，避免转盘抖动
    if (compassSmoothAz < 0) compassSmoothAz = az;
    var diff = az - compassSmoothAz;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    compassSmoothAz = (compassSmoothAz + diff * 0.4 + 360) % 360;
    // 节流：限制绘制频率，长时间运行不卡死（约 10 帧/秒）
    var now = Date.now();
    if (now - compassLastTs < 100) return;
    compassLastTs = now;
    var azShow = Math.round(compassSmoothAz) % 360;
    document.getElementById("compassAzimuth").textContent = azShow + "°";
    var dir = DIRS[Math.round(azShow / 45) % 8];
    document.getElementById("compassDir").textContent = dir;
    document.getElementById("compassTilt").textContent =
        "俯仰 " + Math.round(pitch || 0) + "°　滚转 " + Math.round(roll || 0) + "°";
    drawCompass(azShow);
};

function drawCompass(az) {
    var cv = document.getElementById("compassCanvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var cx = 140, cy = 140, r = 128;
    ctx.clearRect(0, 0, 280, 280);
    // 底盘
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FAFBFF"; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = "#1E88E5"; ctx.stroke();
    // 刻度（每 15° 一格，90° 倍数为主刻度）
    for (var a = 0; a < 360; a += 15) {
        var rad = a * Math.PI / 180;
        var major = (a % 90 === 0);
        var r1 = r - (major ? 22 : 12);
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(rad) * r1, cy - Math.cos(rad) * r1);
        ctx.lineTo(cx + Math.sin(rad) * (r - 4), cy - Math.cos(rad) * (r - 4));
        ctx.lineWidth = major ? 3 : 1;
        ctx.strokeStyle = major ? "#1565C0" : "#90A4AE";
        ctx.stroke();
    }
    // 计算当前方位（8 方位：北 0°、东北 45°、东 90°、东南 135°、南 180°、西南 225°、西 270°、西北 315°）
    var dirIdx = Math.round(az / 45) % 8;
    var currentDir = DIRS[dirIdx];
    // 四个主方位：0=N/北, 2=E/东, 4=S/南, 6=W/西
    var dirs = ["北", "东", "南", "西"];
    var dirAngles = [0, 90, 180, 270];
    for (var i = 0; i < 4; i++) {
        var rad = dirAngles[i] * Math.PI / 180;
        var isCurrent = (Math.round(dirAngles[i] / 45) % 8) === dirIdx;
        // 高亮放大当前朝向的方位字
        var fontSize = isCurrent ? 28 : 20;
        var color = isCurrent ? "#E53935" : "#424242";
        var rText = r - 32;
        ctx.fillStyle = color;
        ctx.font = "bold " + fontSize + "px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        // 北
        if (i === 0) ctx.fillText(dirs[i], cx, cy - rText);
        // 东
        else if (i === 1) ctx.fillText(dirs[i], cx + rText, cy);
        // 南
        else if (i === 2) ctx.fillText(dirs[i], cx, cy + rText);
        // 西
        else if (i === 3) ctx.fillText(dirs[i], cx - rText, cy);
    }
    // 表盘中央显示大号当前方位字（中文）
    ctx.fillStyle = "#E53935";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(currentDir, cx, cy);
    // 指针（相对盘面旋转 az 度）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(az * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(0, -r + 36); ctx.lineTo(-10, 0); ctx.lineTo(10, 0);
    ctx.closePath(); ctx.fillStyle = "#E53935"; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, r - 36); ctx.lineTo(-10, 0); ctx.lineTo(10, 0);
    ctx.closePath(); ctx.fillStyle = "#78909C"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#1E88E5"; ctx.stroke();
    ctx.restore();
}

// ==================== E. 噪音计 ====================

var noiseRunning = false;
var noiseHistory = [];

function initNoiseCheck() {
    var has = false;
    try { if (window.AndroidNative && AndroidNative.hasNoisePermission) has = AndroidNative.hasNoisePermission(); } catch (e) {}
    // 不主动弹权限，等用户点击「开始测量」
}

function toggleNoise() {
    if (noiseRunning) {
        try { if (window.AndroidNative && AndroidNative.stopNoise) AndroidNative.stopNoise(); } catch (e) {}
        noiseRunning = false;
        document.getElementById("noiseBtn").textContent = "开始测量";
        document.getElementById("noiseLevel").textContent = "已停止";
        return;
    }
    var has = false;
    try { if (window.AndroidNative && AndroidNative.hasNoisePermission) has = AndroidNative.hasNoisePermission(); } catch (e) {}
    if (!has) {
        try {
            if (window.AndroidNative && AndroidNative.requestRecordAudioPermission) {
                AndroidNative.requestRecordAudioPermission();
                document.getElementById("noiseLevel").textContent = "等待授权…";
                return; // 授权回调 onRecordAudioGranted 后自动开始
            }
        } catch (e) {}
    }
    startNoiseMeter();
}

function startNoiseMeter() {
    if (!window.AndroidNative || !AndroidNative.startNoise) { alert("当前版本不支持噪音测量"); return; }
    try { AndroidNative.startNoise(); } catch (e) { alert("启动失败：" + e.message); return; }
    noiseRunning = true;
    document.getElementById("noiseBtn").textContent = "停止测量";
}

window.onRecordAudioGranted = function (ok) {
    if (ok) {
        startNoiseMeter();
    } else {
        alert("未获得录音权限，无法测量分贝");
        document.getElementById("noiseLevel").textContent = "权限被拒绝";
    }
};

function noiseLevelOf(db) {
    if (db < 30) return "安静";
    if (db < 50) return "较安静";
    if (db < 70) return "正常";
    if (db < 85) return "较吵";
    if (db < 100) return "很吵";
    return "极吵";
}

function noiseDescOf(db) {
    if (db < 30) return "安静（如深夜室内）";
    if (db < 50) return "较安静（如图书馆）";
    if (db < 70) return "正常交谈";
    if (db < 85) return "较吵（如闹市）";
    if (db < 100) return "很吵（如施工现场）";
    return "极吵（危害听力）";
}

window.onNoiseUpdate = function (db) {
    db = Math.max(20, Math.min(120, Math.round(Number(db) || 0)));
    document.getElementById("noiseDb").textContent = db;
    document.getElementById("noiseLevel").textContent = noiseLevelOf(db);
    document.getElementById("noiseDesc").textContent = noiseDescOf(db) + " · 实时更新";
    noiseHistory.push(db);
    if (noiseHistory.length > 60) noiseHistory.shift();
    drawNoiseWave();
};

function drawNoiseWave() {
    var cv = document.getElementById("noiseCanvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#F5F9FF"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#B0BEC5"; ctx.lineWidth = 1;
    for (var y = H / 4; y < H; y += H / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    if (noiseHistory.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = "#1E88E5"; ctx.lineWidth = 2;
    var n = noiseHistory.length;
    for (var i = 0; i < n; i++) {
        var x = i / 59 * (W - 2) + 1;
        var v = (noiseHistory[i] - 20) / 100 * (H - 10);
        var yy = (H - 4) - v;
        if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
}

// ==================== F. 加密密码 ====================

var CRYPTO_ALGOS = [
    { id: "md5", name: "MD5（哈希）", type: "hash" },
    { id: "sha1", name: "SHA-1（哈希）", type: "hash" },
    { id: "sha256", name: "SHA-256（哈希）", type: "hash" },
    { id: "sha512", name: "SHA-512（哈希）", type: "hash" },
    { id: "sha3-256", name: "SHA3-256（哈希）", type: "hash" },
    { id: "sha3-512", name: "SHA3-512（哈希）", type: "hash" },
    { id: "ripemd160", name: "RIPEMD-160（哈希）", type: "hash" },
    { id: "hmac-md5", name: "HMAC-MD5（需密钥）", type: "hmac" },
    { id: "hmac-sha256", name: "HMAC-SHA256（需密钥）", type: "hmac" },
    { id: "aes", name: "AES（对称，需密钥）", type: "sym" },
    { id: "des", name: "DES（对称，需密钥）", type: "sym" },
    { id: "3des", name: "3DES（对称，需密钥）", type: "sym" },
    { id: "rabbit", name: "Rabbit（对称流，需密钥）", type: "sym" },
    { id: "rc4", name: "RC4（对称流，需密钥）", type: "sym" },
    { id: "base64", name: "Base64（编码）", type: "enc" },
    { id: "base64url", name: "Base64URL（编码）", type: "enc" }
];

function initCryptoAlgo() {
    var sel = document.getElementById("cryptoAlgo");
    if (!sel) return;
    for (var i = 0; i < CRYPTO_ALGOS.length; i++) {
        var op = document.createElement("option");
        op.value = CRYPTO_ALGOS[i].id;
        op.textContent = CRYPTO_ALGOS[i].name;
        sel.appendChild(op);
    }
    // 监听算法变化，动态显示密钥框
    sel.onchange = function() {
        var algo = currentAlgo();
        var keyInput = document.getElementById("cryptoKey");
        var keyHint = document.getElementById("cryptoKeyHint");
        if (!keyInput || !keyHint) return;
        // 哈希、编码类算法无需密钥
        if (algo.type === "hash" || algo.type === "enc") {
            keyInput.style.display = "none";
            keyHint.style.display = "block";
            keyHint.textContent = "无需密钥";
        } else {
            // HMAC、对称加密需要密钥
            keyInput.style.display = "block";
            keyHint.style.display = "none";
        }
    };
    // 初始化时触发一次
    sel.onchange();
}

function switchTab(id, btn) {
    var tabs = btn.parentNode.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("on");
    btn.classList.add("on");
    var list = ["c1", "c2", "c3"];
    for (var j = 0; j < list.length; j++) {
        var el = document.getElementById(list[j]);
        if (el) el.style.display = (list[j] === id ? "block" : "none");
    }
}

function currentAlgo() {
    var id = document.getElementById("cryptoAlgo").value;
    for (var i = 0; i < CRYPTO_ALGOS.length; i++) {
        if (CRYPTO_ALGOS[i].id === id) return CRYPTO_ALGOS[i];
    }
    return CRYPTO_ALGOS[0];
}

function getKey() { return document.getElementById("cryptoKey").value; }

function cryptoDo(encrypt) {
    var algo = currentAlgo();
    var input = document.getElementById("cryptoInput").value;
    var out = document.getElementById("cryptoResult");
    if (!input) { out.textContent = "请输入内容"; return; }
    try {
        var r = "";
        if (algo.type === "hash") {
            if (!encrypt) { out.textContent = "哈希算法不可逆，只能加密/编码"; return; }
            r = doHash(algo.id, input);
        } else if (algo.type === "hmac") {
            if (!encrypt) { out.textContent = "HMAC 算法不可逆，只能加密/编码"; return; }
            var k = getKey();
            if (!k) { out.textContent = "请输入密钥"; return; }
            r = doHmac(algo.id, input, k);
        } else if (algo.type === "sym") {
            var k2 = getKey();
            if (!k2) { out.textContent = "请输入密钥"; return; }
            r = doSym(algo.id, input, k2, encrypt);
        } else {
            r = doEncode(algo.id, input, encrypt);
        }
        out.textContent = r;
    } catch (e) {
        out.textContent = "处理失败：" + e.message;
    }
}

function doHash(id, input) {
    var w;
    switch (id) {
        case "md5": w = CryptoJS.MD5(input); break;
        case "sha1": w = CryptoJS.SHA1(input); break;
        case "sha256": w = CryptoJS.SHA256(input); break;
        case "sha512": w = CryptoJS.SHA512(input); break;
        case "sha3-256": w = CryptoJS.SHA3(input, { outputLength: 256 }); break;
        case "sha3-512": w = CryptoJS.SHA3(input, { outputLength: 512 }); break;
        case "ripemd160": w = CryptoJS.RIPEMD160(input); break;
        default: w = CryptoJS.MD5(input);
    }
    return w.toString();
}

function doHmac(id, input, key) {
    var w;
    if (id === "hmac-md5") w = CryptoJS.HmacMD5(input, key);
    else w = CryptoJS.HmacSHA256(input, key);
    return w.toString();
}

function doSym(id, input, key, encrypt) {
    if (encrypt) {
        var ct;
        switch (id) {
            case "aes": ct = CryptoJS.AES.encrypt(input, key); break;
            case "des": ct = CryptoJS.DES.encrypt(input, key); break;
            case "3des": ct = CryptoJS.TripleDES.encrypt(input, key); break;
            case "rabbit": ct = CryptoJS.Rabbit.encrypt(input, key); break;
            case "rc4": ct = CryptoJS.RC4.encrypt(input, key); break;
            default: ct = CryptoJS.AES.encrypt(input, key);
        }
        return ct.toString();
    } else {
        var dec;
        switch (id) {
            case "aes": dec = CryptoJS.AES.decrypt(input, key); break;
            case "des": dec = CryptoJS.DES.decrypt(input, key); break;
            case "3des": dec = CryptoJS.TripleDES.decrypt(input, key); break;
            case "rabbit": dec = CryptoJS.Rabbit.decrypt(input, key); break;
            case "rc4": dec = CryptoJS.RC4.decrypt(input, key); break;
            default: dec = CryptoJS.AES.decrypt(input, key);
        }
        var plain = dec.toString(CryptoJS.enc.Utf8);
        if (!plain) throw new Error("解密失败：密钥错误或密文格式不正确");
        return plain;
    }
}

function doEncode(id, input, encrypt) {
    if (id === "base64") {
        if (encrypt) {
            return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(input));
        }
        return CryptoJS.enc.Base64.parse(input.trim()).toString(CryptoJS.enc.Utf8);
    }
    // base64url
    if (encrypt) {
        return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(input))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    var s = input.trim().replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8);
}

// ==================== 加密级随机源 ====================

/**
 * 加密级随机整数 [0, max)
 */
function secureRandInt(max) {
    var arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return arr[0] % max;
}

// ==================== 随机密码生成 ====================

function genPassword() {
    var len = parseInt(document.getElementById("pwLen").value, 10) || 16;
    var useUp = document.getElementById("pwUp").checked;
    var useLow = document.getElementById("pwLow").checked;
    var useNum = document.getElementById("pwNum").checked;
    var useSym = document.getElementById("pwSym").checked;
    var pools = [];
    if (useUp) pools.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    if (useLow) pools.push("abcdefghijklmnopqrstuvwxyz");
    if (useNum) pools.push("0123456789");
    if (useSym) pools.push("!@#$%^&*()-_=+[]{};:,.<>?");
    if (pools.length === 0) { alert("请至少选择一种字符类型"); return; }
    var all = pools.join("");
    // 每类至少 1 个，保证覆盖
    var chars = [];
    for (var i = 0; i < pools.length; i++) {
        chars.push(pools[i].charAt(secureRandInt(pools[i].length)));
    }
    for (var j = chars.length; j < len; j++) {
        chars.push(all.charAt(secureRandInt(all.length)));
    }
    // Fisher-Yates 洗牌（加密级随机源）
    for (var k = chars.length - 1; k > 0; k--) {
        var m = secureRandInt(k + 1);
        var tmp = chars[k]; chars[k] = chars[m]; chars[m] = tmp;
    }
    var pw = chars.join("");
    document.getElementById("pwResult").textContent = pw;
    var s = evaluateStrength(pw);
    updateStrengthBar(document.getElementById("pwStrengthBar"), s.score, s.label);
    document.getElementById("pwStrengthTxt").textContent =
        "该密码强度：" + s.label + "（" + s.score + " 分）";
}

// ==================== 密码强度评估 ====================

function evaluateStrength(pw) {
    if (!pw) return { score: 0, label: "空" };
    var score = 0;
    var len = pw.length;
    if (len >= 8) score += 20;
    if (len >= 12) score += 15;
    if (len >= 16) score += 15;
    var hasUp = /[A-Z]/.test(pw);
    var hasLow = /[a-z]/.test(pw);
    var hasNum = /[0-9]/.test(pw);
    var hasSym = /[^A-Za-z0-9]/.test(pw);
    var kinds = (hasUp ? 1 : 0) + (hasLow ? 1 : 0) + (hasNum ? 1 : 0) + (hasSym ? 1 : 0);
    score += kinds * 12;
    if (hasUp && hasLow && hasNum) score += 2;
    if (kinds >= 3) score += 5;
    if (/(.)\1{2,}/.test(pw)) score -= 5;
    if (/^(123456|password|qwerty|abc123|111111|000000|admin|12345678|123456789)$/i.test(pw)) score = 5;
    score = Math.max(0, Math.min(100, score));
    var label = score < 30 ? "弱" : score < 60 ? "中" : score < 85 ? "强" : "极强";
    return { score: score, label: label };
}

function checkStrength() {
    var pw = document.getElementById("pwCheck").value;
    var s = evaluateStrength(pw);
    document.getElementById("pwCheckScore").textContent = s.score + " 分";
    document.getElementById("pwCheckTxt").textContent = s.label;
    updateStrengthBar(document.getElementById("pwCheckBar"), s.score, s.label);
}

function updateStrengthBar(el, score, label) {
    if (!el) return;
    el.style.width = score + "%";
    var color = score < 30 ? "#E53935" : score < 60 ? "#FB8C00" : score < 85 ? "#43A047" : "#1565C0";
    el.style.background = color;
}

function closeOverlay(el) {
    if (el) el.classList.remove("show");
}

function copyCryptoResult() {
    var out = document.getElementById("cryptoResult");
    if (!out || !out.textContent || out.textContent === "结果将显示在这里") { showToast("暂无内容可复制"); return; }
    var ta = document.createElement("textarea");
    ta.value = out.textContent;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    showToast(ok ? "已复制结果" : "复制失败，请手动长按复制");
}

// ==================== 工具页全屏展示 ====================

function openTool(key) {
    var map = {
        number: "tool-number",
        text: "tool-text",
        check: "tool-check",
        today: "tool-today",
        random: "tool-random",
        compass: "tool-compass"
    };
    var id = map[key];
    if (id) {
        var el = document.getElementById(id);
        if (el) {
            var list = document.getElementById("tool-list");
            if (list) list.classList.remove("show");
            el.classList.add("show");
            // 工具初始化
            if (key === "check") loadDeviceInfo();
            if (key === "today") showTodayHistory();
            if (key === "compass") initCompassSupport();
        }
    }
}

/**
 * 打开工具列表全屏页（替代原转盘弹层）
 */
function openToolList() {
    var list = document.getElementById("tool-list");
    if (list) list.classList.add("show");
}

function closeTool() {
    var pages = document.querySelectorAll(".tool-page.show");
    for (var i = 0; i < pages.length; i++) {
        pages[i].classList.remove("show");
    }
    var list = document.getElementById("tool-list");
    if (list) list.classList.add("show");
}

function closeToolList() {
    var list = document.getElementById("tool-list");
    if (list) list.classList.remove("show");
}

function closeToolPage() {
    var pages = document.querySelectorAll(".tool-page.show");
    for (var i = 0; i < pages.length; i++) {
        pages[i].classList.remove("show");
    }
}

// ==================== 版本更新横幅（保留） ====================
(function () {
    var VERSION_URL = 'https://cmmd747.github.io/zhoubian/version.json';
    var bannerShown = false;
    function cmpVer(a, b) {
        var pa = String(a || '').split('.');
        var pb = String(b || '').split('.');
        for (var i = 0; i < 3; i++) {
            var x = parseInt(pa[i] || '0', 10);
            var y = parseInt(pb[i] || '0', 10);
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
    }

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

    function checkRemote() {
        try {
            // 未开启「接收版本更新提醒」则不检查更新横幅
            try {
                if (window.AndroidNative && typeof window.AndroidNative.getNotifyEnabled === 'function') {
                    if (!AndroidNative.getNotifyEnabled()) return;
                }
            } catch (e) {}
            var xhr = new XMLHttpRequest();
            xhr.open('GET', VERSION_URL + '?t=' + Date.now(), true);
            xhr.timeout = 8000;
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    try {
                        var j = JSON.parse(xhr.responseText);
                        var apkUrl = j.apkUrl || '';
                        var ver = j.appVersion || '';
                        var currentVer = '';
                        try {
                            if (window.AndroidNative && typeof window.AndroidNative.getAppVersion === 'function') {
                                currentVer = window.AndroidNative.getAppVersion() || '';
                            }
                        } catch (e) {}
                        if (apkUrl && ver && (!currentVer || cmpVer(currentVer, ver) < 0)) showBanner(ver, apkUrl);
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
