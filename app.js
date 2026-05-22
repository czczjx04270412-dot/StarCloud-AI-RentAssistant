const panels = document.querySelectorAll(".panel");
const navItems = document.querySelectorAll(".nav-item");

const steps = [
  {
    id: "bed",
    name: "床和睡眠区",
    method: "拍照 + 现场感受",
    shots: ["床垫表面", "床架连接处", "床边墙角", "窗边/空调位置"],
    action: "拍床垫、床架、墙角和窗边；靠近床闻是否有霉味，坐下感受床架是否晃动。",
  },
  {
    id: "wall",
    name: "墙面和天花板",
    method: "拍照识别",
    shots: ["墙角", "天花板", "窗边墙面", "空调洞附近"],
    action: "拍墙角、窗边、天花板、空调洞附近，尽量拍清水渍、鼓包、裂缝和色差。",
  },
  {
    id: "bathroom",
    name: "卫生间",
    method: "拍照 + 现场测试",
    shots: ["地漏", "马桶底部", "洗手台下方水管", "排风口/窗户"],
    action: "拍地漏、马桶、洗手台下方；打开水龙头 30 秒，看排水速度和是否反味。",
  },
  {
    id: "kitchen",
    name: "厨房",
    method: "拍照 + 现场测试",
    shots: ["灶台", "油烟机", "水槽下方", "橱柜内部"],
    action: "拍灶台、油烟机、橱柜和水槽下方；打开水龙头，测试油烟机和燃气/电磁炉状态。",
  },
  {
    id: "socket",
    name: "插座和用电",
    method: "拍照 + 现场测试",
    shots: ["床边插座", "书桌插座", "厨房插座", "空调/热水器插座"],
    action: "拍床边、书桌、厨房、空调附近插座；用充电器测试常用插座是否通电。",
  },
  {
    id: "security",
    name: "门锁和安全",
    method: "现场测试",
    shots: ["门锁", "门框", "猫眼/门禁", "楼道照明"],
    action: "开关门 2 次，测试能否反锁；观察门框、猫眼、门禁、楼道照明和逃生通道。",
  },
  {
    id: "window",
    name: "窗户、采光和噪音",
    method: "拍照 + 录音",
    shots: ["窗户整体", "窗框密封", "窗外环境", "楼间距/临街方向"],
    action: "拍窗户和窗外环境；开窗/关窗各停留 15 秒，记录车流、人声、空调外机等声音。",
  },
  {
    id: "contract",
    name: "合同和费用",
    method: "询问房东 + 合同核对",
    shots: ["费用说明", "合同关键条款", "交付清单", "房东承诺截图"],
    action: "逐条确认押金、维修、转租、提前退租、水电网费、物业费和中介费。",
  },
];

let currentStep = 0;
let currentPhoto = "";
let scanPhoto = "";
let stepPhotos = {};
let savedHomes = [];
let scanResults = {};
let selectedHomeIndex = null;
let mediaRecorder = null;
let audioChunks = [];
let audioRecord = null;
let audioContext = null;
let analyser = null;
let audioSource = null;
let audioAnimation = null;
let dbSamples = [];
let peakDbValue = null;

const reminderGroups = [
  {
    group: "费用类",
    items: ["月租是否包含物业费、网费、管理费？", "水电燃气怎么计费？", "是否民水民电？", "是否有中介费/服务费？", "押几付几？", "押金什么时候退？"],
  },
  {
    group: "退租类",
    items: ["能否提前退租？", "提前退租扣多少钱？", "能否转租？", "找到下家后是否能退押金？"],
  },
  {
    group: "维修类",
    items: ["家电坏了谁修？", "管道堵塞谁负责？", "墙面返潮/漏水谁负责？", "维修响应时间多久？"],
  },
  {
    group: "交付类",
    items: ["家具有哪些？", "哪些东西已有损坏？", "是否有交付清单？", "房东承诺维修的内容什么时候完成？"],
  },
  {
    group: "身份类",
    items: ["房东是否为产权人？", "是否二房东？", "是否能看房产证/委托书？", "合租的话室友是否固定？"],
  },
  {
    group: "居住规则类",
    items: ["能否养宠物？", "能否做饭？", "能否留宿？", "是否限电限水？", "是否可以办居住证？"],
  },
  {
    group: "安全类",
    items: ["门锁能否更换？", "是否有消防隐患？", "是否隔断房？", "是否群租房？"],
  },
];

let reminderState = {};
const API_BASE = location.port === "5174" ? "" : "http://localhost:5174";
const CURRENT_OPENID = "demo_openid_for_miniprogram";

function qs(selector) {
  return document.querySelector(selector);
}

async function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", `${API_BASE}${path}`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("X-RentLens-User", CURRENT_OPENID);
    Object.entries(options.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
        return;
      }
      try {
        resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.send(options.body || null);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file, fallbackName = "upload.bin") {
  try {
    const data = await readFileAsDataUrl(file);
    const result = await apiRequest("/api/files/upload", {
      method: "POST",
      body: JSON.stringify({
        name: file.name || fallbackName,
        type: file.type || "application/octet-stream",
        data,
      }),
    });
    return result.url;
  } catch (error) {
    console.warn("File upload failed, using local preview URL.", error);
    return URL.createObjectURL(file);
  }
}

async function analyzeWithAi(payload) {
  const data = await apiRequest("/api/ai/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.result;
}

function buildFieldInspectionPayload(step, fieldNote, photos) {
  return {
    skill: "field_inspection",
    home: {
      name: qs("#listingName").value,
      rent: qs("#rentPrice").value,
      location: qs("#listingLocation").value,
      commute: qs("#commuteTime").value,
      note: qs("#listingNote").value,
    },
    currentStep: {
      id: step.id,
      name: step.name,
      method: step.method,
      shots: step.shots,
      action: step.action,
    },
    photos: (photos || []).map((photo) => ({
      label: photo.label,
      description: "用户已上传照片，当前版本暂未接入图片识别，请结合照片标签、现场备注和录音数据谨慎分析。",
      url: photo.url,
    })),
    audio: audioRecord?.noise
      ? {
          duration: audioRecord.duration,
          avgDb: audioRecord.noise.avgDb,
          peakDb: audioRecord.noise.peakDb,
          noiseType: "未识别",
        }
      : null,
    fieldNote,
    context: {
      source: "现场检测",
    },
  };
}

function applyFieldAiResult(stepResult, aiResult) {
  return {
    ...stepResult,
    level: aiResult.level || "信息不足",
    title: aiResult.title || "AI 已完成分析",
    findings: aiResult.findings || [],
    evidence: aiResult.evidence || [],
    livingImpact: aiResult.livingImpact || "",
    askLandlord: aiResult.askLandlord || [],
    missingChecks: aiResult.missingChecks || [],
    nextAction: aiResult.nextAction || "",
    impact: aiResult.livingImpact || "",
    advice: [...(aiResult.askLandlord || []), aiResult.nextAction].filter(Boolean).join("；"),
    score: typeof aiResult.score === "number" ? aiResult.score : null,
    aiGenerated: true,
    source: "ai",
  };
}

function clearCurrentHomeState() {
  currentPhoto = "";
  scanPhoto = "";
  stepPhotos = {};
  selectedHomeIndex = null;
  scanResults = {};
  audioRecord = null;
  qs("#listingName").value = "";
  qs("#rentPrice").value = "";
  qs("#commuteTime").value = "";
  qs("#listingLocation").value = "";
  qs("#listingNote").value = "";
  qs("#fieldNote").value = "";
  qs("#recordStatus").textContent = "未录音";
  qs("#recordButton").textContent = "开始录音";
  qs("#coverPhoto").removeAttribute("src");
  qs("#roomPhoto").removeAttribute("src");
  qs("#coverPhoto").classList.remove("has-image");
  qs("#roomPhoto").classList.remove("has-image");
  qs("#emptyPhoto").style.display = "grid";
  qs("#scanEmpty").style.display = "grid";
}

function makeSerializable(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === "blob") return undefined;
    return item;
  }));
}

function getBootstrapData() {
  if (window.__RENTLENS_BOOTSTRAP__) return window.__RENTLENS_BOOTSTRAP__;
  const script = [...document.scripts].find((item) => item.textContent.includes("__RENTLENS_BOOTSTRAP__"));
  const match = script?.textContent.match(/window\.__RENTLENS_BOOTSTRAP__\s*=\s*(\{[\s\S]*\});?/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function hydrateFromBootstrap() {
  const bootstrap = getBootstrapData();
  if (!bootstrap) return false;
  if (Array.isArray(bootstrap.homes)) {
    savedHomes = bootstrap.homes;
    if (savedHomes.length) {
      loadHome(Math.min(selectedHomeIndex >= 0 ? selectedHomeIndex : 0, savedHomes.length - 1));
    } else {
      selectedHomeIndex = null;
      renderSavedHomes();
    }
  }
  if (bootstrap.reminders && typeof bootstrap.reminders === "object") {
    reminderState = bootstrap.reminders;
  }
  document.body.dataset.backendHomes = String(savedHomes.length);
  return true;
}

async function saveHomesToBackend() {
  try {
    await apiRequest("/api/homes", {
      method: "PUT",
      body: JSON.stringify({ homes: makeSerializable(savedHomes) }),
    });
  } catch (error) {
    console.warn("Saving homes failed.", error);
  }
}

async function loadHomesFromBackend() {
  try {
    const data = await apiRequest("/api/homes");
    savedHomes = Array.isArray(data.homes) ? data.homes : [];
    renderSavedHomes();
    if (savedHomes.length) loadHome(0);
    else {
      clearCurrentHomeState();
      renderSavedHomes();
    }
  } catch (error) {
    console.warn("Loading homes failed.", error);
  }
}

async function saveRemindersToBackend() {
  try {
    await apiRequest("/api/reminders", {
      method: "PUT",
      body: JSON.stringify({ reminders: reminderState }),
    });
  } catch (error) {
    console.warn("Saving reminders failed.", error);
  }
}

async function loadRemindersFromBackend() {
  try {
    const data = await apiRequest("/api/reminders");
    reminderState = data.reminders || {};
  } catch (error) {
    console.warn("Loading reminders failed.", error);
  }
}

function switchPanel(id) {
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === id));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.panel === id));
}

function setImage(file, targets) {
  if (!file) return;
  const imageUrl = URL.createObjectURL(file);
  setImageUrl(imageUrl, targets);
}

function setImageUrl(imageUrl, targets) {
  targets.forEach((target) => {
    target.src = imageUrl;
    target.classList.add("has-image");
  });
  currentPhoto = imageUrl;
  qs("#emptyPhoto").style.display = "none";
}

function getCurrentListing() {
  return {
    name: qs("#listingName").value || "未命名房源",
    rent: qs("#rentPrice").value || "待确认",
    commute: qs("#commuteTime").value || "待确认",
    location: qs("#listingLocation").value || "待确认",
    note: qs("#listingNote").value || "",
    photo: currentPhoto,
    score: calculateScore(),
    risk: summarizeRisk(),
    verdict: getVerdict(calculateScore()),
    results: { ...scanResults },
    stepPhotos: { ...stepPhotos },
  };
}

function isAiAnalyzed(item) {
  return item?.aiGenerated === true || item?.source === "ai";
}

function normalizeScanResult(item) {
  if (!item) return item;
  if (isAiAnalyzed(item)) return item;
  return {
    id: item.id,
    name: item.name,
    method: item.method,
    shots: item.shots || [],
    action: item.action || "",
    photo: item.photo || "",
    photos: item.photos || [],
    fieldNote: item.fieldNote || "",
    audio: item.audio || null,
    inputs: item.inputs || buildInputSummary(item.fieldNote || "", item.audio || null, item.photos || []),
    noise: item.noise || null,
    level: "待AI分析",
    title: "已记录现场材料，等待 AI 分析",
    impact: "",
    advice: "",
    score: null,
    aiGenerated: false,
  };
}

function normalizeScanResults(results = {}) {
  return Object.fromEntries(
    Object.entries(results || {}).map(([key, value]) => [key, normalizeScanResult(value)])
  );
}

async function syncCurrentHome(options = {}) {
  if (selectedHomeIndex === null || !savedHomes[selectedHomeIndex]) return;
  savedHomes[selectedHomeIndex] = getCurrentListing();
  renderSavedHomes();
  renderInspection();
  renderReport();
  if (options.save !== false) {
    await saveHomesToBackend();
  }
}

function calculateScore() {
  const values = steps
    .map((step) => scanResults[step.id]?.score)
    .filter((value) => typeof value === "number");
  if (!values.length) return null;
  return Math.round(values.reduce((sum, item) => sum + item, 0) / values.length);
}

function summarizeRisk() {
  const risky = Object.values(scanResults)
    .filter((item) => isAiAnalyzed(item) && item.level !== "低风险")
    .map((item) => item.name);
  return risky.slice(0, 2).join("、") || "等待AI分析";
}

function getVerdict(score) {
  if (typeof score !== "number") return "待AI分析";
  if (score >= 80) return "优先考虑";
  if (score >= 70) return "谨慎考虑";
  return "暂不建议";
}

function renderSavedHomes() {
  qs("#savedCount").textContent = `${savedHomes.length} 套`;
  qs("#savedList").innerHTML =
    savedHomes
      .map(
        (home, index) => `
          <article class="saved-card ${index === selectedHomeIndex ? "selected-home" : ""}" data-select-home="${index}">
            <div class="saved-thumb">${home.photo ? `<img src="${home.photo}" alt="${home.name}" />` : "<span>无图</span>"}</div>
            <div>
              <strong>${home.name}${index === selectedHomeIndex ? " · 当前" : ""}</strong>
              <span>${home.location} · ${home.rent} 元/月 · ${home.commute}</span>
            </div>
          </article>
        `
      )
      .join("") || `<div class="empty-state">还没有保存房源。先上传照片、填写信息，再点击“保存房源”。</div>`;

  document.querySelectorAll("[data-select-home]").forEach((card) => {
    card.addEventListener("click", () => loadHome(Number(card.dataset.selectHome)));
  });
}

function openReminderDrawer() {
  renderReminderList();
  qs("#reminderDrawer").classList.add("open");
  qs("#drawerScrim").classList.add("open");
  qs("#reminderDrawer").setAttribute("aria-hidden", "false");
}

function closeReminderDrawer() {
  qs("#reminderDrawer").classList.remove("open");
  qs("#drawerScrim").classList.remove("open");
  qs("#reminderDrawer").setAttribute("aria-hidden", "true");
}

window.openReminderDrawer = openReminderDrawer;
window.closeReminderDrawer = closeReminderDrawer;

function renderReminderList() {
  const total = reminderGroups.reduce((sum, group) => sum + group.items.length, 0);
  const confirmed = Object.values(reminderState).filter((value) => value === "已留证").length;
  qs("#reminderProgress").textContent = `${confirmed} / ${total} 已留证`;
  qs("#reminderList").innerHTML = reminderGroups
    .map((group, groupIndex) => {
      const groupConfirmed = group.items.filter((item) => reminderState[item] === "已留证").length;
      return `
        <details class="reminder-group" ${groupIndex < 3 ? "open" : ""}>
          <summary>
            <strong>${group.group}</strong>
            <span>${groupConfirmed} / ${group.items.length} 已留证</span>
          </summary>
          <div class="reminder-items">
            ${group.items
              .map((item) => {
                const status = reminderState[item] || "待确认";
                return `
                  <article class="reminder-item">
                    <p>${item}</p>
                    <div class="status-row" data-question="${item}">
                      ${["待确认", "已口头确认", "已留证", "暂不适用"]
                        .map((option) => `<button class="${status === option ? "active" : ""}" data-status="${option}" type="button">${option}</button>`)
                        .join("")}
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </details>
      `;
    })
    .join("");

  document.querySelectorAll(".status-row button").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.parentElement.dataset.question;
      reminderState[question] = button.dataset.status;
      renderReminderList();
      saveRemindersToBackend();
    });
  });
}

function loadHome(index) {
  const home = savedHomes[index];
  if (!home) return;
  selectedHomeIndex = index;
  qs("#listingName").value = home.name;
  qs("#rentPrice").value = home.rent;
  qs("#commuteTime").value = home.commute;
  qs("#listingLocation").value = home.location;
  qs("#listingNote").value = home.note;
  currentPhoto = home.photo;
  scanPhoto = "";
  scanResults = normalizeScanResults(home.results || {});
  stepPhotos = { ...(home.stepPhotos || {}) };
  if (home.photo) {
    qs("#coverPhoto").src = home.photo;
    qs("#coverPhoto").classList.add("has-image");
    qs("#emptyPhoto").style.display = "none";
  } else {
    qs("#coverPhoto").removeAttribute("src");
    qs("#coverPhoto").classList.remove("has-image");
    qs("#emptyPhoto").style.display = "grid";
  }
  qs("#fieldNote").value = "";
  audioRecord = null;
  qs("#recordStatus").textContent = "未录音";
  qs("#recordButton").textContent = "开始录音";
  updateRoomPhotoForCurrentStep();
  renderSavedHomes();
  renderSteps();
  renderAiResult(scanResults[steps[currentStep].id]);
  renderInspection();
  renderReport();
  renderEvidenceList();
}

async function saveCurrentHome() {
  const home = getCurrentListing();
  if (selectedHomeIndex !== null && savedHomes[selectedHomeIndex]) {
    savedHomes[selectedHomeIndex] = home;
  } else {
    savedHomes.unshift(home);
    selectedHomeIndex = 0;
  }
  renderSavedHomes();
  renderReport();
  await saveHomesToBackend();
}

function resetCurrentHome() {
  qs("#listingName").value = "";
  qs("#rentPrice").value = "";
  qs("#commuteTime").value = "";
  qs("#listingLocation").value = "";
  qs("#listingNote").value = "";
  currentPhoto = "";
  scanPhoto = "";
  stepPhotos = {};
  selectedHomeIndex = null;
  scanResults = {};
  qs("#coverPhoto").removeAttribute("src");
  qs("#roomPhoto").removeAttribute("src");
  qs("#coverPhoto").classList.remove("has-image");
  qs("#roomPhoto").classList.remove("has-image");
  qs("#emptyPhoto").style.display = "grid";
  qs("#scanEmpty").style.display = "grid";
  renderSteps();
  renderAiResult();
  renderInspection();
  renderReport();
  renderEvidenceList();
}

function renderSteps() {
  const step = steps[currentStep];
  qs("#stepIndex").textContent = `步骤 ${currentStep + 1} / ${steps.length}`;
  qs("#currentStepName").textContent = step.name;
  qs("#currentStepMethod").textContent = step.method;
  qs("#currentStepPrompt").textContent = "按建议拍摄点记录照片，并补充录音或现场文字。接入 AI 后，这里会生成真实判断。";
  qs("#currentStepAction").textContent = `操作：${step.action}`;
  qs("#shotGuide").innerHTML = `
    <strong>建议拍摄：</strong>
    ${step.shots.map((shot) => `<span>${shot}</span>`).join("")}
  `;

  qs("#stepList").innerHTML = steps
    .map((item, index) => {
      const done = Boolean(scanResults[item.id]);
      const active = index === currentStep;
      return `
        <button class="step-item ${active ? "active" : ""} ${done ? "done" : ""}" data-step="${index}">
          <span>${index + 1}</span>
          <strong>${item.name}<em>${item.method}</em></strong>
          <small>${done ? "已检测" : "待检测"}</small>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      currentStep = Number(button.dataset.step);
      renderSteps();
      renderEvidenceList();
      renderAiResult(scanResults[steps[currentStep].id]);
    });
  });
  renderEvidenceList();
}

async function runCurrentScan() {
  if (!ensureHomeSelected()) return;
  const step = steps[currentStep];
  const fieldNote = qs("#fieldNote").value.trim();
  const photos = stepPhotos[step.id] || [];
  const baseResult = {
    id: step.id,
    name: step.name,
    method: step.method,
    shots: step.shots,
    action: step.action,
    photo: photos[0]?.url || scanPhoto,
    photos,
    fieldNote,
    audio: audioRecord,
    inputs: buildInputSummary(fieldNote, audioRecord, photos),
    noise: audioRecord?.noise || null,
    level: "待AI分析",
    title: "已记录现场材料，等待 AI 分析",
    impact: "",
    advice: "",
    score: null,
    aiGenerated: false,
  };
  scanResults[step.id] = baseResult;
  qs("#fieldNote").value = "";
  audioRecord = null;
  qs("#recordStatus").textContent = "未录音";
  qs("#recordButton").textContent = "开始录音";
  renderAiResult(scanResults[step.id]);
  renderInspection();
  renderReport();
  await syncCurrentHome();
  const button = qs("#runScan");
  const buttonText = button.textContent;
  button.textContent = "AI分析中";
  button.disabled = true;
  try {
    const aiResult = await analyzeWithAi(buildFieldInspectionPayload(step, fieldNote, photos));
    scanResults[step.id] = applyFieldAiResult(baseResult, aiResult);
    renderAiResult(scanResults[step.id]);
    renderInspection();
    renderReport();
    await syncCurrentHome();
  } catch (error) {
    scanResults[step.id] = {
      ...baseResult,
      level: "信息不足",
      title: error.message.includes("DEEPSEEK_API_KEY") ? "AI 尚未配置" : "AI 分析暂时失败",
      advice: "现场材料已保存，可以稍后重新分析。",
      aiGenerated: false,
    };
    renderAiResult(scanResults[step.id]);
    renderInspection();
    renderReport();
    await syncCurrentHome();
  } finally {
    button.textContent = buttonText;
    button.disabled = false;
  }
  currentStep = Math.min(currentStep + 1, steps.length - 1);
  renderSteps();
}

function showNoHomeModal() {
  qs("#noHomeModal").classList.add("open");
  qs("#noHomeModal").setAttribute("aria-hidden", "false");
}

function ensureHomeSelected() {
  if (selectedHomeIndex !== null) return true;
  showNoHomeModal();
  return false;
}

function closeNoHomeModal() {
  qs("#noHomeModal").classList.remove("open");
  qs("#noHomeModal").setAttribute("aria-hidden", "true");
}

function buildInputSummary(fieldNote, audio, photos) {
  const inputs = [];
  if (photos?.length) inputs.push(`${photos.length} 张照片`);
  if (audio?.noise) inputs.push(`录音 ${audio.duration} 秒，均值 ${audio.noise.avgDb} dB，峰值 ${audio.noise.peakDb} dB`);
  else if (audio) inputs.push(`录音 ${audio.duration} 秒`);
  if (fieldNote) inputs.push("现场文字记录");
  return inputs.length ? inputs.join(" + ") : "未添加照片、录音或备注";
}

function renderAiResult(result) {
  if (!result) {
    qs("#aiResult").innerHTML = `
      <span>等待记录</span>
      <h3>完成当前步骤后，这里会显示现场记录。</h3>
      <p>接入 AI 后，会在这里生成风险等级、居住影响和建议动作。</p>
    `;
    return;
  }

  qs("#aiResult").innerHTML = `
    <span>${result.level}</span>
    <h3>${result.title}</h3>
    <p><strong>记录内容：</strong>${result.inputs}</p>
    ${result.photos?.length ? `<p><strong>照片证据：</strong>${result.photos.map((photo) => photo.label).join("、")}</p>` : ""}
    ${result.noise ? `<p><strong>噪音估算：</strong>平均 ${result.noise.avgDb} dB，峰值 ${result.noise.peakDb} dB，${result.noise.risk}。</p>` : ""}
    <p><strong>检测方式：</strong>${result.method}</p>
    <p><strong>现场动作：</strong>${result.action}</p>
    ${result.fieldNote ? `<p><strong>现场记录：</strong>${result.fieldNote}</p>` : ""}
    ${
      isAiAnalyzed(result)
        ? `
          <p><strong>住进去可能会怎样：</strong>${result.impact}</p>
          <p><strong>建议动作：</strong>${result.advice}</p>
        `
        : `<p><strong>AI 分析：</strong>待接入真实 AI 后生成。</p>`
    }
  `;
}

function renderInspection() {
  const results = Object.values(scanResults);
  qs("#inspectionGrid").innerHTML =
    results
      .map(
        (item) => `
          <article class="inspection-card ${riskClass(item.level)}">
            <span>${item.level}</span>
            <h3>${item.name}</h3>
            <div class="method-pill">${item.method}</div>
            <p>${item.title}</p>
            <div>
              <strong>记录内容</strong>
              <small>${item.inputs}</small>
            </div>
            ${
              item.photos?.length
                ? `<div><strong>照片证据</strong><small>${item.photos.map((photo) => photo.label).join("、")}</small></div>`
                : ""
            }
            ${
              item.noise
                ? `<div><strong>噪音估算</strong><small>平均 ${item.noise.avgDb} dB，峰值 ${item.noise.peakDb} dB，${item.noise.risk}</small></div>`
                : ""
            }
            ${
              item.fieldNote
                ? `<div><strong>现场记录</strong><small>${item.fieldNote}</small></div>`
                : ""
            }
            ${
              isAiAnalyzed(item)
                ? `
                  <div>
                    <strong>居住影响</strong>
                    <small>${item.impact}</small>
                  </div>
                  <div>
                    <strong>追问/处理</strong>
                    <small>${item.advice}</small>
                  </div>
                `
                : `<div><strong>AI 分析</strong><small>待接入真实 AI 后生成。</small></div>`
            }
          </article>
        `
      )
      .join("") || `<div class="empty-state">还没有检测结果。保存并选择房源后，完成现场检测，这里会显示对应房源的检查结论。</div>`;
}

function riskClass(level) {
  if (level === "高风险") return "high";
  if (level === "中风险") return "medium";
  if (level === "低风险") return "low";
  return "";
}

function renderReport() {
  const score = calculateScore();
  const current = getCurrentListing();
  qs("#scoreValue").textContent = typeof score === "number" ? score : "--";
  qs("#reportTitle").textContent = `${current.name || "当前房源"}房源分析`;

  const scoreItems = [
    ["睡眠舒适度", scanResults.bed?.score],
    ["潮湿漏水", scanResults.wall?.score],
    ["卫生间", scanResults.bathroom?.score],
    ["厨房", scanResults.kitchen?.score],
    ["用电便利", scanResults.socket?.score],
    ["门锁安全", scanResults.security?.score],
    ["采光噪音", scanResults.window?.score],
    ["合同风险", scanResults.contract?.score],
  ];

  qs("#scoreBoard").innerHTML = scoreItems
    .map(
      ([label, value]) => `
        <article class="score-card">
          <header><strong>${label}</strong><span>${typeof value === "number" ? value : "待分析"}</span></header>
          <div class="bar-track"><div class="bar-fill" style="width: ${typeof value === "number" ? value : 0}%"></div></div>
        </article>
      `
    )
    .join("");

  const questionItems = Object.values(scanResults)
    .filter((item) => isAiAnalyzed(item) && item.advice)
    .map((item) => item.advice);
  qs("#questionList").innerHTML =
    (questionItems.length ? questionItems : ["接入 AI 后，这里会生成房东追问清单。"])
      .map((item) => `<li>${item}</li>`)
      .join("");

  const completed = Object.keys(scanResults).length;
  const analyzedResults = Object.values(scanResults).filter(isAiAnalyzed);
  const highRisks = analyzedResults.filter((item) => item.level === "高风险").length;
  const mediumRisks = analyzedResults.filter((item) => item.level === "中风险").length;
  const insufficientRisks = analyzedResults.filter((item) => item.level === "信息不足").length;
  const riskLabel = analyzedResults.length
    ? (highRisks ? `${highRisks} 个高风险` : mediumRisks ? `${mediumRisks} 个中风险` : insufficientRisks ? `${insufficientRisks} 项信息不足` : "暂无明显风险")
    : "待AI分析";
  const riskText = analyzedResults.length ? `${summarizeRisk()}。` : "接入 AI 后会显示风险重点。";
  qs("#analysisSummary").innerHTML = `
    <article>
      <span>检测完成度</span>
      <strong>${completed} / ${steps.length}</strong>
      <p>${completed ? "已记录现场检测材料。" : "保存房源后，完成现场检测会在这里形成记录。"}</p>
    </article>
    <article>
      <span>风险状态</span>
      <strong>${riskLabel}</strong>
      <p>${riskText}</p>
    </article>
    <article>
      <span>租前建议</span>
      <strong>${getVerdict(score)}</strong>
      <p>${typeof score === "number" ? (score >= 80 ? "整体条件较好，签约前补齐费用和交付确认。" : score >= 70 ? "建议先解决关键风险，再考虑签约。" : "当前风险偏高，建议继续核实或暂缓签约。") : "接入 AI 后会生成最终建议。"}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getReportData() {
  const home = getCurrentListing();
  const completed = Object.keys(scanResults).length;
  const totalReminders = reminderGroups.reduce((sum, group) => sum + group.items.length, 0);
  const reminderCounts = reminderGroups.flatMap((group) => group.items).reduce(
    (counts, item) => {
      const status = reminderState[item] || "待确认";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    },
    {}
  );

  return {
    home,
    score: calculateScore(),
    verdict: getVerdict(calculateScore()),
    completed,
    totalSteps: steps.length,
    risks: Object.values(scanResults).filter((item) => isAiAnalyzed(item) && item.level !== "低风险"),
    results: Object.values(scanResults),
    questions: Object.values(scanResults)
      .filter((item) => isAiAnalyzed(item) && item.advice)
      .map((item) => item.advice),
    reminderCounts,
    totalReminders,
    generatedAt: new Date().toLocaleString("zh-CN"),
  };
}

function buildReportMarkup() {
  const report = getReportData();
  const cover = report.home.photo
    ? `<img src="${escapeHtml(report.home.photo)}" alt="${escapeHtml(report.home.name)}" />`
    : "<span>无图</span>";
  const risks = report.risks.length ? report.risks.map((item) => item.name).join("、") : "待AI分析";
  const questions = report.questions.length ? report.questions : ["接入 AI 后，这里会生成房东追问清单。"];
  const reminderSummary = Object.entries(report.reminderCounts)
    .map(([status, count]) => `${status} ${count} 项`)
    .join("，");

  return `
    <article class="report-paper">
      <header>
        <div class="report-cover">${cover}</div>
        <div>
          <p class="eyebrow">RentLens viewing report</p>
          <h2>${escapeHtml(report.home.name || "当前房源")}看房报告</h2>
          <p>${escapeHtml(report.home.location)} · ${escapeHtml(report.home.rent)} 元/月 · ${escapeHtml(report.home.commute)}</p>
          <div class="report-meta">
            <span>综合评分<strong>${typeof report.score === "number" ? report.score : "待分析"}</strong></span>
            <span>租前建议<strong>${escapeHtml(report.verdict)}</strong></span>
            <span>生成时间<strong>${escapeHtml(report.generatedAt)}</strong></span>
          </div>
        </div>
      </header>

      <section>
        <h3>决策摘要</h3>
        <div class="report-kpis">
          <span>检测完成度<strong>${report.completed} / ${report.totalSteps}</strong></span>
          <span>风险重点<strong>${escapeHtml(risks)}</strong></span>
          <span>签约提醒<strong>${escapeHtml(reminderSummary || `待确认 ${report.totalReminders} 项`)}</strong></span>
        </div>
        ${report.home.note ? `<p>${escapeHtml(report.home.note)}</p>` : ""}
      </section>

      <section>
        <h3>建议追问房东</h3>
        <ul class="report-list">
          ${questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>

      <section>
        <h3>现场检测记录</h3>
        <div class="report-step-list">
          ${
            report.results.length
              ? report.results
                  .map(
                    (item) => `
                      <div class="report-step">
                        <strong>${escapeHtml(item.name)} · ${escapeHtml(item.level)}</strong>
                        <small>${escapeHtml(item.title)}</small>
                        <small>记录内容：${escapeHtml(item.inputs)}</small>
                        ${item.fieldNote ? `<small>现场记录：${escapeHtml(item.fieldNote)}</small>` : ""}
                        ${item.noise ? `<small>噪音估算：平均 ${item.noise.avgDb} dB，峰值 ${item.noise.peakDb} dB，${escapeHtml(item.noise.risk)}</small>` : ""}
                        ${
                          isAiAnalyzed(item)
                            ? `
                              <small>居住影响：${escapeHtml(item.impact)}</small>
                              <small>建议动作：${escapeHtml(item.advice)}</small>
                            `
                            : `<small>AI 分析：待接入真实 AI 后生成。</small>`
                        }
                      </div>
                    `
                  )
                  .join("")
              : `<p>还没有检测结果。保存并选择房源后，完成现场检测，这里会显示对应房源的检查结论。</p>`
          }
        </div>
      </section>
    </article>
  `;
}

function openReportModal() {
  if (!ensureHomeSelected()) return;
  qs("#reportPreviewContent").innerHTML = buildReportMarkup();
  qs("#reportModal").classList.add("open");
  qs("#reportModal").setAttribute("aria-hidden", "false");
}

function closeReportModal() {
  qs("#reportModal").classList.remove("open");
  qs("#reportModal").setAttribute("aria-hidden", "true");
}

function buildReportDocumentHtml() {
  const report = getReportData();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(report.home.name || "当前房源")}看房报告</title>
  <style>
    body { margin: 0; padding: 32px; background: #f3f7f5; color: #15201e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .report-paper { display: grid; gap: 16px; max-width: 980px; margin: 0 auto; }
    header, section { padding: 20px; border: 1px solid #d8e3df; border-radius: 8px; background: #fff; }
    header { display: grid; grid-template-columns: 180px 1fr; gap: 18px; align-items: center; }
    .report-cover { display: grid; place-items: center; overflow: hidden; aspect-ratio: 4 / 3; border-radius: 8px; background: #eef3f1; color: #697873; }
    .report-cover img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .eyebrow { margin: 0 0 8px; color: #007964; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    h2, h3 { margin: 0 0 10px; }
    p, li, small { color: #5f6f6a; line-height: 1.7; }
    .report-meta, .report-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .report-meta span, .report-kpis span { display: block; padding: 12px; border-radius: 8px; background: #f5faf8; color: #5f6f6a; }
    strong { color: #15201e; }
    .report-meta strong, .report-kpis strong { display: block; margin-top: 4px; }
    .report-step-list { display: grid; gap: 12px; }
    .report-step { padding: 14px; border: 1px solid #d8e3df; border-radius: 8px; background: #f9fbfa; }
    .report-step strong, .report-step small { display: block; }
    @media (max-width: 720px) { body { padding: 16px; } header, .report-meta, .report-kpis { grid-template-columns: 1fr; } }
  </style>
</head>
<body>${buildReportMarkup()}</body>
</html>`;
}

function buildWordReportMarkup() {
  const report = getReportData();
  const risks = report.risks.length ? report.risks.map((item) => item.name).join("、") : "暂无明显风险";
  const questions = report.questions.length ? report.questions : ["先完成现场检测，这里会生成房东追问清单。"];
  const reminderSummary = Object.entries(report.reminderCounts)
    .map(([status, count]) => `${status} ${count} 项`)
    .join("，") || `待确认 ${report.totalReminders} 项`;
  const cover = report.home.photo
    ? `<p><img src="${escapeHtml(report.home.photo)}" alt="${escapeHtml(report.home.name)}" style="width:260px;height:auto;" /></p>`
    : "";

  return `
    <h1>${escapeHtml(report.home.name || "当前房源")}看房报告</h1>
    <p class="muted">生成时间：${escapeHtml(report.generatedAt)}</p>
    ${cover}

    <h2>一、房源信息</h2>
    <table>
      <tr><th>房源名称</th><td>${escapeHtml(report.home.name || "当前房源")}</td></tr>
      <tr><th>位置</th><td>${escapeHtml(report.home.location)}</td></tr>
      <tr><th>月租</th><td>${escapeHtml(report.home.rent)} 元/月</td></tr>
      <tr><th>通勤时间</th><td>${escapeHtml(report.home.commute)}</td></tr>
      <tr><th>看房备注</th><td>${escapeHtml(report.home.note || "无")}</td></tr>
    </table>

    <h2>二、决策摘要</h2>
    <table>
      <tr><th>综合评分</th><td>${typeof report.score === "number" ? report.score : "待分析"}</td></tr>
      <tr><th>租前建议</th><td>${escapeHtml(report.verdict)}</td></tr>
      <tr><th>检测完成度</th><td>${report.completed} / ${report.totalSteps}</td></tr>
      <tr><th>风险重点</th><td>${escapeHtml(risks)}</td></tr>
      <tr><th>签约提醒</th><td>${escapeHtml(reminderSummary)}</td></tr>
    </table>

    <h2>三、建议追问房东</h2>
    <ol>
      ${questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>

    <h2>四、现场检测记录</h2>
    ${
      report.results.length
        ? report.results
            .map(
              (item, index) => `
                <h3>${index + 1}. ${escapeHtml(item.name)} · ${escapeHtml(item.level)}</h3>
                <table>
                  <tr><th>检测结论</th><td>${escapeHtml(item.title)}</td></tr>
                  <tr><th>记录内容</th><td>${escapeHtml(item.inputs)}</td></tr>
                  ${item.fieldNote ? `<tr><th>现场记录</th><td>${escapeHtml(item.fieldNote)}</td></tr>` : ""}
                  ${item.noise ? `<tr><th>噪音估算</th><td>平均 ${item.noise.avgDb} dB，峰值 ${item.noise.peakDb} dB，${escapeHtml(item.noise.risk)}</td></tr>` : ""}
                  ${
                    isAiAnalyzed(item)
                      ? `
                        <tr><th>居住影响</th><td>${escapeHtml(item.impact)}</td></tr>
                        <tr><th>建议动作</th><td>${escapeHtml(item.advice)}</td></tr>
                      `
                      : `<tr><th>AI 分析</th><td>待接入真实 AI 后生成。</td></tr>`
                  }
                </table>
              `
            )
            .join("")
        : `<p>还没有检测结果。保存并选择房源后，完成现场检测，这里会显示对应房源的检查结论。</p>`
    }
  `;
}

function buildWordDocumentHtml() {
  const report = getReportData();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(report.home.name || "当前房源")}看房报告</title>
  <style>
    @page { margin: 2.2cm 2cm; }
    body {
      color: #15201e;
      font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.75;
    }
    h1 {
      margin: 0 0 10pt;
      color: #006b5b;
      font-size: 24pt;
      line-height: 1.25;
      text-align: center;
    }
    h2 {
      margin: 22pt 0 10pt;
      padding-bottom: 5pt;
      border-bottom: 1pt solid #9bb8b0;
      color: #006b5b;
      font-size: 16pt;
    }
    h3 {
      margin: 16pt 0 8pt;
      color: #15201e;
      font-size: 13.5pt;
    }
    p {
      margin: 6pt 0;
      font-size: 12pt;
    }
    .muted {
      color: #5f6f6a;
      text-align: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8pt 0 14pt;
      table-layout: fixed;
    }
    th, td {
      border: 1pt solid #d8e3df;
      padding: 8pt 10pt;
      vertical-align: top;
      font-size: 12pt;
      line-height: 1.65;
    }
    th {
      width: 28%;
      background: #eef8f5;
      color: #15201e;
      font-weight: bold;
    }
    ol {
      margin: 6pt 0 12pt 22pt;
      padding: 0;
    }
    li {
      margin: 6pt 0;
      font-size: 12pt;
      line-height: 1.7;
    }
  </style>
</head>
<body>${buildWordReportMarkup()}</body>
</html>`;
}

function downloadReportHtml() {
  if (!ensureHomeSelected()) return;
  const report = getReportData();
  const html = buildReportDocumentHtml();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `${(report.home.name || "看房报告").replace(/[\\/:*?"<>|]/g, "-")}.html`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadReportWord() {
  if (!ensureHomeSelected()) return;
  const report = getReportData();
  const html = buildWordDocumentHtml();
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `${(report.home.name || "看房报告").replace(/[\\/:*?"<>|]/g, "-")}.doc`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

navItems.forEach((item) => item.addEventListener("click", () => switchPanel(item.dataset.panel)));

async function handleCoverFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const url = await uploadFile(file, file.name || "cover.jpg");
  setImageUrl(url, [qs("#coverPhoto")]);
  await syncCurrentHome();
  event.target.value = "";
}

qs("#coverUpload").addEventListener("change", handleCoverFile);
qs("#coverCamera").addEventListener("change", handleCoverFile);

async function handleScanFiles(event) {
  if (!ensureHomeSelected()) {
    event.target.value = "";
    return;
  }
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const step = steps[currentStep];
  stepPhotos[step.id] ||= [];
  for (const [index, file] of files.entries()) {
    const url = await uploadFile(file, file.name || `${step.id}-${index + 1}.jpg`);
    stepPhotos[step.id].push({
      url,
      label: step.shots[stepPhotos[step.id].length] || `补充照片 ${index + 1}`,
    });
  }
  scanPhoto = stepPhotos[step.id][stepPhotos[step.id].length - 1].url;
  qs("#roomPhoto").src = scanPhoto;
  qs("#roomPhoto").classList.add("has-image");
  qs("#scanEmpty").style.display = "none";
  renderEvidenceList();
  if (selectedHomeIndex !== null) {
    if (scanResults[step.id]) {
      scanResults[step.id].photos = stepPhotos[step.id];
      scanResults[step.id].photo = scanPhoto;
      scanResults[step.id].inputs = buildInputSummary(scanResults[step.id].fieldNote || "", scanResults[step.id].audio || null, stepPhotos[step.id]);
      renderAiResult(scanResults[step.id]);
    }
    syncCurrentHome();
  }
  event.target.value = "";
}

qs("#scanUpload").addEventListener("change", handleScanFiles);
qs("#scanCamera").addEventListener("change", handleScanFiles);

qs("#clearStepPhotos").addEventListener("click", () => {
  if (!ensureHomeSelected()) return;
  const step = steps[currentStep];
  stepPhotos[step.id] = [];
  if (scanResults[step.id]) {
    scanResults[step.id].photos = [];
    scanResults[step.id].photo = "";
    scanResults[step.id].inputs = buildInputSummary(scanResults[step.id].fieldNote || "", scanResults[step.id].audio || null, []);
    renderAiResult(scanResults[step.id]);
  }
  renderEvidenceList();
  syncCurrentHome();
});

function renderEvidenceList() {
  const step = steps[currentStep];
  const photos = stepPhotos[step.id] || [];
  updateRoomPhotoForCurrentStep();
  qs("#evidenceList").innerHTML =
    photos
      .map(
        (photo, index) => `
          <div class="evidence-item">
            <button class="delete-photo" type="button" data-delete-photo="${index}" aria-label="删除照片">×</button>
            <img src="${photo.url}" alt="${photo.label}" />
            <span>${index + 1}. ${photo.label}</span>
          </div>
        `
      )
      .join("") || `<div class="empty-state compact-empty">还没有添加本项照片。建议按上方拍摄点补齐关键位置。</div>`;

  document.querySelectorAll("[data-delete-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetIndex = Number(button.dataset.deletePhoto);
      stepPhotos[step.id].splice(targetIndex, 1);
      const remaining = stepPhotos[step.id];
      scanPhoto = remaining[remaining.length - 1]?.url || "";
      if (scanPhoto) {
        qs("#roomPhoto").src = scanPhoto;
        qs("#roomPhoto").classList.add("has-image");
        qs("#scanEmpty").style.display = "none";
      } else {
        qs("#roomPhoto").removeAttribute("src");
        qs("#roomPhoto").classList.remove("has-image");
        qs("#scanEmpty").style.display = "grid";
      }
      if (scanResults[step.id]) {
        scanResults[step.id].photos = remaining;
        scanResults[step.id].photo = scanPhoto;
        scanResults[step.id].inputs = buildInputSummary(scanResults[step.id].fieldNote || "", scanResults[step.id].audio || null, remaining);
        renderAiResult(scanResults[step.id]);
      }
      renderEvidenceList();
      syncCurrentHome();
    });
  });
}

function updateRoomPhotoForCurrentStep() {
  const step = steps[currentStep];
  const photos = stepPhotos[step.id] || [];
  scanPhoto = photos[photos.length - 1]?.url || "";
  if (scanPhoto) {
    qs("#roomPhoto").src = scanPhoto;
    qs("#roomPhoto").classList.add("has-image");
    qs("#scanEmpty").style.display = "none";
  } else {
    qs("#roomPhoto").removeAttribute("src");
    qs("#roomPhoto").classList.remove("has-image");
    qs("#scanEmpty").style.display = "grid";
  }
}

async function toggleRecording() {
  if (!ensureHomeSelected()) return;
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    qs("#recordButton").textContent = "处理中...";
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    qs("#recordStatus").textContent = "当前浏览器不支持录音，可改用文字记录";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    startNoiseMeter(stream);
    mediaRecorder = new MediaRecorder(stream);
    const startedAt = Date.now();
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      const noise = finishNoiseMeter();
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const audioUrl = await uploadFile(blob, `noise-${Date.now()}.webm`);
      audioRecord = {
        url: audioUrl,
        duration,
        noise,
        label: duration >= 10 ? "可用于噪音判断" : "录音偏短，建议 10 秒以上",
      };
      qs("#recordStatus").textContent = `${audioRecord.label} · ${duration} 秒 · 平均 ${noise.avgDb} dB`;
      qs("#recordButton").textContent = "重新录音";
    };
    mediaRecorder.start();
    qs("#recordStatus").textContent = "录音中，建议保持 10-15 秒";
    qs("#recordButton").textContent = "停止录音";
  } catch (error) {
    qs("#recordStatus").textContent = "未获得麦克风权限，可改用文字记录";
  }
}

function startNoiseMeter(stream) {
  stopNoiseAnimation();
  dbSamples = [];
  peakDbValue = null;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  audioSource = audioContext.createMediaStreamSource(stream);
  audioSource.connect(analyser);
  sampleNoise();
}

function sampleNoise() {
  if (!analyser) return;
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sumSquares = 0;
  for (const value of data) sumSquares += value * value;
  const rms = Math.sqrt(sumSquares / data.length);
  const relativeDb = rms > 0 ? 20 * Math.log10(rms) : -100;
  const offset = Number(qs("#calibrationOffset").value || 45);
  const estimatedDb = Math.max(25, Math.min(95, Math.round(relativeDb + offset + 60)));
  dbSamples.push(estimatedDb);
  peakDbValue = peakDbValue === null ? estimatedDb : Math.max(peakDbValue, estimatedDb);
  updateNoiseUi(estimatedDb, getAverageDb(), peakDbValue);
  audioAnimation = requestAnimationFrame(sampleNoise);
}

function finishNoiseMeter() {
  stopNoiseAnimation();
  const avgDb = getAverageDb();
  const peakDb = peakDbValue || avgDb;
  const risk = getNoiseRisk(avgDb, peakDb);
  updateNoiseUi(avgDb, avgDb, peakDb);
  qs("#noiseRisk").textContent = risk;
  if (audioContext) audioContext.close();
  audioContext = null;
  analyser = null;
  audioSource = null;
  return { avgDb, peakDb, risk };
}

function stopNoiseAnimation() {
  if (audioAnimation) cancelAnimationFrame(audioAnimation);
  audioAnimation = null;
}

function getAverageDb() {
  if (!dbSamples.length) return 0;
  return Math.round(dbSamples.reduce((sum, value) => sum + value, 0) / dbSamples.length);
}

function getNoiseRisk(avgDb, peakDb) {
  if (avgDb >= 65 || peakDb >= 78) return "高噪音风险，睡眠可能明显受影响";
  if (avgDb >= 55 || peakDb >= 68) return "中噪音风险，建议关窗和夜间复测";
  return "低噪音风险，当前环境较安静";
}

function updateNoiseUi(liveDb, avgDb, peakDb) {
  qs("#liveDb").textContent = liveDb || "--";
  qs("#avgDb").textContent = avgDb || "--";
  qs("#peakDb").textContent = peakDb || "--";
  qs("#noiseRisk").textContent = liveDb ? getNoiseRisk(avgDb || liveDb, peakDb || liveDb) : "未检测";
  qs("#meterFill").style.width = `${Math.max(0, Math.min(100, ((liveDb || 25) - 25) * 1.5))}%`;
}

qs("#saveListing").addEventListener("click", saveCurrentHome);
qs("#newListing").addEventListener("click", resetCurrentHome);
qs("#runScan").addEventListener("click", runCurrentScan);
qs("#recordButton").addEventListener("click", toggleRecording);

qs("#fieldNote").addEventListener("focus", () => {
  ensureHomeSelected();
});
qs("#clearResults").addEventListener("click", () => {
  scanResults = {};
  renderAiResult();
  renderSteps();
  renderInspection();
  renderReport();
  syncCurrentHome();
});

qs("#closeNoHomeModal").addEventListener("click", closeNoHomeModal);
qs("#goOverviewFromNotice").addEventListener("click", () => {
  closeNoHomeModal();
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === "overview"));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.panel === "overview"));
});
qs("#openReminderDrawer")?.addEventListener("click", openReminderDrawer);
qs("#openReminderFromOverview").addEventListener("click", openReminderDrawer);
qs("#closeReminderDrawer").addEventListener("click", closeReminderDrawer);
qs("#drawerScrim").addEventListener("click", closeReminderDrawer);
qs("#previewReport").addEventListener("click", openReportModal);
qs("#downloadReport").addEventListener("click", downloadReportHtml);
qs("#downloadReportFromModal").addEventListener("click", downloadReportHtml);
qs("#downloadWordReport").addEventListener("click", downloadReportWord);
qs("#downloadWordReportFromModal").addEventListener("click", downloadReportWord);
qs("#closeReportModal").addEventListener("click", closeReportModal);
qs("#closeReportModalAction").addEventListener("click", closeReportModal);

async function initApp() {
  document.body.dataset.appStarted = "1";
  const hasBootstrap = hydrateFromBootstrap();
  if (!hasBootstrap) {
    await loadRemindersFromBackend();
    await loadHomesFromBackend();
  }
  renderSavedHomes();
  renderSteps();
  renderAiResult(scanResults[steps[currentStep].id]);
  renderInspection();
  renderReport();
}

initApp();
