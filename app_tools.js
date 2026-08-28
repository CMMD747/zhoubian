/**
 * 源 v2.0 - 工具逻辑（app_tools.js）
 *
 * 职责（均为工具列表下的 5 个工具）：
 *   1. 号码归属地（离线号段库 data.js）
 *   2. 文字统计
 *   3. 手机验机自检（设备信息 + 坏点检测 + 触摸测试）
 *   4. 历史上的今天（离线数据 history.js）
 *   5. 批量随机数据生成器（加密级随机源）
 */

// ==================== 打开工具（已由 app.js 统一管理） ====================

// 旧 openTool 已移至 app.js，此处保留工具初始化逻辑

// ==================== 1. 号码归属地（离线） ====================

function lookupNumber() {
    var phone = document.getElementById("numInput").value.trim();
    var out = document.getElementById("numResult");
    if (!/^1\d{10}$/.test(phone)) {
        out.textContent = "请输入 11 位有效手机号（1 开头）";
        return;
    }
    var seg4 = phone.substring(0, 4);
    var seg3 = phone.substring(0, 3);
    var province = (typeof SEGMENTS !== "undefined") ? SEGMENTS[seg4] : null;
    var operator = (typeof OPERATORS !== "undefined") ? OPERATORS[seg3] : null;
    if (!province && !operator) {
        out.textContent = "未收录该号段（离线库覆盖主流号段，可能为新增/特殊号段）";
        return;
    }
    var lines = [];
    lines.push("📱 " + phone);
    lines.push("运营商：" + (operator || "未知"));
    lines.push("归属地：" + (province || "未知省份"));
    lines.push("（离线库 · 精确到省份，不联网）");
    if (operator && operator.indexOf("虚拟") >= 0) {
        lines.push("提示：该号段为虚拟运营商（如阿里/京东/小米等）");
    }
    out.innerHTML = lines.join("<br>");
}

// ==================== 2. 文字统计 ====================

function doTextStat() {
    var t = document.getElementById("textStatInput").value;
    var grid = document.getElementById("textStatGrid");
    var chars = t.length;
    var noSpace = t.replace(/\s/g, "").length;
    var m = t.match(/[a-zA-Z0-9]+/g);
    var enWords = m ? m.length : 0;
    var cnChars = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    var digits = (t.match(/[0-9]/g) || []).length;
    var punct = (t.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g) || []).length;
    var lines = t ? t.split("\n").length : 0;
    var unique = {};
    for (var i = 0; i < t.length; i++) unique[t[i]] = true;
    grid.innerHTML =
        '<div class="stat-cell"><div class="num">' + chars + '</div><div class="lab">总字符</div></div>' +
        '<div class="stat-cell"><div class="num">' + noSpace + '</div><div class="lab">不含空白</div></div>' +
        '<div class="stat-cell"><div class="num">' + cnChars + '</div><div class="lab">中文字</div></div>' +
        '<div class="stat-cell"><div class="num">' + enWords + '</div><div class="lab">英文单词</div></div>' +
        '<div class="stat-cell"><div class="num">' + digits + '</div><div class="lab">数字</div></div>' +
        '<div class="stat-cell"><div class="num">' + punct + '</div><div class="lab">标点</div></div>' +
        '<div class="stat-cell"><div class="num">' + lines + '</div><div class="lab">行数</div></div>' +
        '<div class="stat-cell"><div class="num">' + Object.keys(unique).length + '</div><div class="lab">去重字符</div></div>';
}

// ==================== 3. 手机验机自检 ====================

function fmtIndent() {
    var ta = document.getElementById("textStatInput");
    if (!ta) return;
    var t = ta.value;
    if (!t) { showToast("请先输入文本"); return; }
    ta.value = t.split("\n").map(function (l) {
        return l.trim() === "" ? l : "\u3000\u3000" + l;
    }).join("\n");
    doTextStat();
    showToast("已添加首行缩进（每段首行）");
}
function fmtJoinLines() {
    var ta = document.getElementById("textStatInput");
    if (!ta) return;
    var t = ta.value;
    if (!t) { showToast("请先输入文本"); return; }
    ta.value = t.replace(/\s*\n\s*/g, " ").replace(/ +/g, " ").trim();
    doTextStat();
    showToast("已合并为单行");
}
function fmtRemoveEmpty() {
    var ta = document.getElementById("textStatInput");
    if (!ta) return;
    var t = ta.value;
    if (!t) { showToast("请先输入文本"); return; }
    ta.value = t.split("\n").filter(function (l) { return l.trim() !== ""; }).join("\n");
    doTextStat();
    showToast("已删除空行");
}
function fmtWrapLines() {
    var ta = document.getElementById("textStatInput");
    if (!ta) return;
    var t = ta.value;
    if (!t) { showToast("请先输入文本"); return; }
    var num = parseInt(document.getElementById("fmtWrapNum").value, 10) || 30;
    if (num < 2) num = 2;
    if (num > 200) num = 200;
    var out = t.split("\n").map(function (p) {
        if (p.trim() === "") return "";
        var parts = [];
        for (var j = 0; j < p.length; j += num) parts.push(p.substring(j, j + num));
        return parts.join("\n");
    }).join("\n");
    ta.value = out;
    doTextStat();
    showToast("已按每 " + num + " 字换行");
}
function loadDeviceInfo() {
    var box = document.getElementById("deviceInfoBox");
    if (!box) return;
    box.textContent = "读取设备信息中…";
    try {
        var info = {};
        if (window.AndroidNative && AndroidNative.getDeviceInfo) {
            info = JSON.parse(AndroidNative.getDeviceInfo() || "{}");
        }
        var lines = [];
        var model = ((info.brand || "") + " " + (info.model || "")).trim();
        lines.push("型号：" + (model || "未知"));
        lines.push("系统：" + (info.androidVersion || info.osVersion || "未知"));
        lines.push("分辨率：" + (info.screen || "未知"));
        lines.push("电池：" + (info.battery !== undefined ? info.battery + "%" : "未知"));
        lines.push("存储：" + (info.storage || info.totalStorage || "未知"));
        lines.push("内存：" + (info.ram || info.totalRam || "未知"));
        lines.push("序列号：" + (info.serial || info.imei || "未知"));
        box.innerHTML = lines.join("<br>");
    } catch (e) {
        box.textContent = "设备信息读取失败：" + e.message;
    }
}

// ---- 坏点检测 ----

var deadColors = ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"];
var deadIdx = 0;
var deadActive = false;

function startDeadPixel() {
    closeToolPage();  // 关闭当前工具页（tool-check），不回到工具列表
    deadIdx = 0;
    deadActive = true;
    var layer = document.getElementById("deadPixelLayer");
    layer.style.background = deadColors[0];
    layer.classList.add("show");
    document.getElementById("deadPixelHint").textContent =
        "第 1/" + deadColors.length + " 色 · 点击屏幕切换 · 观察有无异常像素";
}

function nextDeadColor() {
    if (!deadActive) return;
    deadIdx = (deadIdx + 1) % deadColors.length;
    document.getElementById("deadPixelLayer").style.background = deadColors[deadIdx];
    document.getElementById("deadPixelHint").textContent =
        "第 " + (deadIdx + 1) + "/" + deadColors.length + " 色 · 点击屏幕切换 · 观察有无异常像素";
}

function closeDeadPixel(e) {
    if (e) e.stopPropagation();
    deadActive = false;
    document.getElementById("deadPixelLayer").classList.remove("show");
}

// ---- 触摸测试 ----

var touchActive = false;

function startTouchTest() {
    closeToolPage();  // 关闭当前工具页（tool-check），不回到工具列表
    touchActive = true;
    var layer = document.getElementById("touchTestLayer");
    layer.classList.add("show");
    document.getElementById("touchList").innerHTML = "";
    document.getElementById("touchInfo").textContent = "触摸屏幕任意位置";
}

function closeTouchTest(e) {
    if (e) e.stopPropagation();
    touchActive = false;
    document.getElementById("touchTestLayer").classList.remove("show");
}

// 绑定触摸事件（文件加载时 DOM 已就绪）
(function () {
    var layer = document.getElementById("touchTestLayer");
    if (!layer) return;
    var counter = 0;

    function addPoint(x, y, type) {
        if (!touchActive) return;
        counter++;
        document.getElementById("touchInfo").textContent =
            type + " (" + Math.round(x) + ", " + Math.round(y) + ")";
        var list = document.getElementById("touchList");
        var div = document.createElement("div");
        div.textContent = "#" + counter + " " + type + " (" + Math.round(x) + ", " + Math.round(y) + ")";
        list.appendChild(div);
        while (list.children.length > 30) list.removeChild(list.firstChild);
    }

    layer.addEventListener("touchstart", function (e) {
        var t = e.touches[0];
        if (t) addPoint(t.clientX, t.clientY, "按下");
    }, { passive: true });
    layer.addEventListener("touchmove", function (e) {
        var t = e.touches[0];
        if (t) addPoint(t.clientX, t.clientY, "滑动");
    }, { passive: true });
    layer.addEventListener("touchend", function (e) {
        var c = e.changedTouches[0];
        if (c) addPoint(c.clientX, c.clientY, "抬起");
    }, { passive: true });
})();

// ==================== 4. 历史上的今天（离线） ====================

function showTodayHistory() {
    var now = new Date();
    var mon = now.getMonth() + 1;
    var day = now.getDate();
    document.getElementById("todayDate").textContent = mon + " 月 " + day + " 日";
    var list = document.getElementById("todayList");
    var key = mon + "-" + day;
    var events = (typeof TODAY_HISTORY !== "undefined") ? TODAY_HISTORY[key] : null;
    if (!events || events.length === 0) {
        list.innerHTML = "今日暂无收录事件";
        return;
    }
    var html = "";
    for (var i = 0; i < events.length; i++) {
        html += "· " + events[i] + "<br>";
    }
    list.innerHTML = html;
}

// ==================== 5. 批量随机数据（加密级随机源） ====================

function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}

function genRandomData() {
    var type = document.getElementById("randType").value;
    var count = parseInt(document.getElementById("randCount").value, 10) || 20;
    var out = [];
    for (var i = 0; i < count; i++) {
        out.push(genOne(type));
    }
    // 生成结果合理排序：数字按数值升序，其余按字符串排序
    if (type === "num") {
        out.sort(function (a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); });
    } else {
        out.sort();
    }
    // 带序号分行渲染，观感整齐（序号灰字 + 等宽内容）
    var html = out.map(function (v, idx) {
        return "<div style=\"display:flex;gap:10px;padding:3px 0;align-items:baseline;\">"
            + "<span style=\"color:#90A4AE;min-width:32px;font-family:monospace;font-size:12px;\">" + (idx + 1) + ".</span>"
            + "<span style=\"font-family:monospace;word-break:break-all;\">" + v + "</span>"
            + "</div>";
    }).join("");
    document.getElementById("randResult").innerHTML = html;
}

function genOne(type) {
    switch (type) {
        case "num": return pad2(secureRandInt(10000));           // 0-9999
        case "pw": return genRandomPw(12);
        case "phone": return genRandomPhone();
        case "date": return genRandomDate();
        case "hex": return genRandomHex(32);
        default: return "";
    }
}

function genRandomPw(len) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
    var s = "";
    for (var i = 0; i < len; i++) s += chars.charAt(secureRandInt(chars.length));
    return s;
}

function genRandomPhone() {
    var heads = ["130", "131", "132", "133", "135", "136", "137", "138", "139",
        "150", "151", "152", "153", "155", "156", "157", "158", "159",
        "176", "177", "178", "180", "181", "182", "183", "185", "186", "187", "188", "189"];
    var head = heads[secureRandInt(heads.length)];
    var tail = "";
    for (var i = 0; i < 8; i++) tail += String(secureRandInt(10));
    return head + tail;
}

function genRandomDate() {
    var y = 2015 + secureRandInt(10); // 2015-2024
    var m = 1 + secureRandInt(12);
    var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    var dMax = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    var d = 1 + secureRandInt(dMax);
    return y + "-" + pad2(m) + "-" + pad2(d);
}

function genRandomHex(len) {
    var hex = "0123456789abcdef";
    var s = "";
    for (var i = 0; i < len; i++) s += hex.charAt(secureRandInt(16));
    return s;
}

function copyRandResult() {
    var txt = document.getElementById("randResult").textContent;
    if (!txt || txt === "点击「生成」后显示结果") { alert("暂无内容可复制"); return; }
    var ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    alert(ok ? "已复制" : "复制失败，请手动长按复制");
}