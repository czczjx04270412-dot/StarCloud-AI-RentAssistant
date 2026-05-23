const STORAGE_KEY = "rentlens_homes";
const API_BASE = "https://star-cloud-ai-rent-assistant.vercel.app";

const steps = [
  {
    id: "bed",
    name: "床和睡眠区",
    method: "拍照 + 现场感受",
    shots: ["床垫表面", "床架连接处", "床边墙角", "窗边/空调位置"],
    action: "拍床垫、床架、墙角和窗边；靠近床闻是否有霉味，坐下感受床架是否晃动。"
  },
  {
    id: "wall",
    name: "墙面和天花板",
    method: "拍照识别",
    shots: ["墙角", "天花板", "窗边墙面", "空调洞附近"],
    action: "拍墙角、窗边、天花板和空调洞附近，记录水渍、鼓包、裂缝和色差。"
  },
  {
    id: "bathroom",
    name: "卫生间",
    method: "拍照 + 现场测试",
    shots: ["地漏", "马桶底部", "洗手台下方水管", "排风口/窗户"],
    action: "打开水龙头 30 秒，看排水速度、反味和漏水情况。"
  },
  {
    id: "kitchen",
    name: "厨房",
    method: "拍照 + 现场测试",
    shots: ["灶台", "油烟机", "水槽下方", "橱柜内部"],
    action: "测试水槽、油烟机和灶具，观察油污、异味和渗水。"
  },
  {
    id: "socket",
    name: "插座和用电",
    method: "拍照 + 现场测试",
    shots: ["床边插座", "书桌插座", "厨房插座", "空调/热水器插座"],
    action: "用充电器测试常用插座是否通电，观察是否松动或烧黑。"
  },
  {
    id: "security",
    name: "门锁和安全",
    method: "现场测试",
    shots: ["门锁", "门框", "猫眼/门禁", "楼道照明"],
    action: "测试能否反锁，观察门框、门禁、楼道照明和逃生通道。"
  },
  {
    id: "window",
    name: "窗户、采光和噪音",
    method: "拍照 + 录音",
    shots: ["窗户整体", "窗框密封", "窗外环境", "楼间距/临街方向"],
    action: "记录窗户密封、采光和窗外噪音，建议白天夜间各看一次。"
  },
  {
    id: "contract",
    name: "合同和费用",
    method: "询问房东 + 合同核对",
    shots: ["费用说明", "合同关键条款", "交付清单", "房东承诺截图"],
    action: "确认押金、维修、转租、提前退租、水电网费、物业费和中介费。"
  }
];

function getResult(results, stepId) {
  return results && results[stepId] ? results[stepId] : null;
}

Page({
  data: {
    activeTab: "overview",
    form: {
      name: "",
      rent: "",
      commute: "",
      location: "",
      note: "",
      photo: ""
    },
    homes: [],
    selectedHomeId: "",
    selectedHome: null,
    steps,
    currentStepIndex: 0,
    currentStep: steps[0],
    fieldNote: "",
    scanResults: {},
    currentPhotos: [],
    currentResult: null,
    aiLoading: false,
    completedCount: 0,
    progress: 0,
    score: "待分析",
    advice: "完成现场检测后，这里会汇总当前房源风险。"
  },

  onLoad() {
    const homes = wx.getStorageSync(STORAGE_KEY) || [];
    const selectedHomeId = homes.length ? homes[0].id : "";
    this.setData({ homes, selectedHomeId });
    this.refreshSelectedHome();
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab });
    this.refreshSelectedHome();
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  updateFieldNote(event) {
    this.setData({ fieldNote: event.detail.value });
  },

  chooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: (res) => {
        this.setData({ "form.photo": res.tempFiles[0].tempFilePath });
      }
    });
  },

  saveHome() {
    const id = this.data.selectedHomeId || `${Date.now()}`;
    const nextHome = {
      ...this.data.form,
      id,
      results: this.data.scanResults
    };
    const homes = this.data.homes.filter((home) => home.id !== id);
    homes.unshift(nextHome);
    wx.setStorageSync(STORAGE_KEY, homes);
    this.setData({ homes, selectedHomeId: id });
    this.refreshSelectedHome();
    wx.showToast({ title: "已保存", icon: "success" });
  },

  selectHome(event) {
    const selectedHomeId = event.currentTarget.dataset.id;
    const selectedHome = this.data.homes.find((home) => home.id === selectedHomeId);
    if (!selectedHome) return;
    this.setHomeState(selectedHomeId, selectedHome);
  },

  setHomeState(selectedHomeId, selectedHome) {
    const scanResults = selectedHome.results || {};
    const currentResult = getResult(scanResults, this.data.currentStep.id);
    this.setData({
      selectedHomeId,
      selectedHome,
      form: {
        name: selectedHome.name || "",
        rent: selectedHome.rent || "",
        commute: selectedHome.commute || "",
        location: selectedHome.location || "",
        note: selectedHome.note || "",
        photo: selectedHome.photo || ""
      },
      scanResults,
      currentResult,
      currentPhotos: currentResult ? currentResult.photos || [] : [],
      fieldNote: currentResult ? currentResult.note || "" : ""
    });
    this.refreshReport();
  },

  chooseStepPhoto() {
    if (!this.data.selectedHomeId) {
      wx.showToast({ title: "请先选择房源", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 6,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: (res) => {
        const step = this.data.currentStep;
        const existing = getResult(this.data.scanResults, step.id)?.photos || [];
        const photos = res.tempFiles.map((file, index) => ({
          url: file.tempFilePath,
          label: step.shots[existing.length + index] || `补充照片 ${existing.length + index + 1}`
        }));
        const nextPhotos = existing.concat(photos);
        const nextResult = {
          ...(getResult(this.data.scanResults, step.id) || {}),
          name: step.name,
          method: step.method,
          photos: nextPhotos
        };
        this.setData({
          [`scanResults.${step.id}`]: nextResult,
          currentResult: nextResult,
          currentPhotos: nextPhotos
        });
        this.saveResultsToHome();
      }
    });
  },

  deleteStepPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const step = this.data.currentStep;
    const result = getResult(this.data.scanResults, step.id) || {};
    const photos = [...(result.photos || [])];
    photos.splice(index, 1);
    const nextResult = { ...result, photos };
    this.setData({
      [`scanResults.${step.id}`]: nextResult,
      currentResult: nextResult,
      currentPhotos: photos
    });
    this.saveResultsToHome();
  },

  previewPhoto(event) {
    const urls = this.data.currentPhotos.map((photo) => photo.url);
    if (!urls.length) return;
    wx.previewImage({
      current: event.currentTarget.dataset.url,
      urls
    });
  },

  async completeStep() {
    if (!this.data.selectedHomeId) {
      wx.showToast({ title: "请先选择房源", icon: "none" });
      return;
    }

    const step = this.data.currentStep;
    const existing = getResult(this.data.scanResults, step.id) || {};
    const result = {
      ...existing,
      name: step.name,
      method: step.method,
      note: this.data.fieldNote,
      photos: existing.photos || [],
      completedAt: new Date().toLocaleString()
    };

    this.setData({
      [`scanResults.${step.id}`]: result,
      currentResult: result,
      aiLoading: true
    });
    this.saveResultsToHome();
    this.refreshReport();
    wx.showLoading({ title: "AI分析中" });

    try {
      const aiResult = await this.analyzeCurrentStep(step, result);
      const merged = {
        ...result,
        ai: aiResult,
        score: typeof aiResult.score === "number" ? aiResult.score : null
      };
      this.setData({
        [`scanResults.${step.id}`]: merged,
        currentResult: merged,
        fieldNote: ""
      });
      this.saveResultsToHome();
      this.refreshReport();
      wx.hideLoading();
      this.setData({ aiLoading: false });
      wx.showToast({ title: "AI分析完成", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      this.setData({ aiLoading: false });
      console.error("AI analysis failed:", error);
      wx.showToast({ title: "AI暂时不可用，已保存记录", icon: "none" });
    }
  },

  analyzeCurrentStep(step, result) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE}/api/ai/analyze`,
        method: "POST",
        header: {
          "Content-Type": "application/json",
          "X-RentLens-User": "wechat_demo_openid"
        },
        data: {
          skill: "field_inspection",
          home: {
            name: this.data.form.name,
            rent: this.data.form.rent,
            location: this.data.form.location,
            commute: this.data.form.commute,
            note: this.data.form.note
          },
          currentStep: {
            id: step.id,
            name: step.name,
            method: step.method,
            shots: step.shots,
            action: step.action
          },
          photos: (result.photos || []).map((photo) => ({
            label: photo.label,
            description: "用户已在小程序上传现场照片，当前版本先结合照片标签和文字记录进行分析。",
            url: photo.url
          })),
          fieldNote: result.note,
          audio: null,
          context: {
            source: "微信小程序现场检测"
          }
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.result) {
            resolve(res.data.result);
            return;
          }
          console.error("AI response error:", res.statusCode, res.data);
          reject(new Error((res.data && res.data.error) || `HTTP ${res.statusCode}`));
        },
        fail: reject
      });
    });
  },

  goStep(event) {
    const currentStepIndex = Number(event.currentTarget.dataset.index);
    const currentStep = steps[currentStepIndex];
    const currentResult = getResult(this.data.scanResults, currentStep.id);
    this.setData({
      currentStepIndex,
      currentStep,
      currentResult,
      currentPhotos: currentResult ? currentResult.photos || [] : [],
      fieldNote: currentResult ? currentResult.note || "" : ""
    });
  },

  saveResultsToHome() {
    const homes = this.data.homes.map((home) => {
      if (home.id !== this.data.selectedHomeId) return home;
      return { ...home, results: this.data.scanResults };
    });
    wx.setStorageSync(STORAGE_KEY, homes);
    this.setData({ homes });
  },

  refreshSelectedHome() {
    const selectedHome = this.data.homes.find((home) => home.id === this.data.selectedHomeId) || null;
    if (!selectedHome) {
      this.refreshReport();
      return;
    }
    this.setHomeState(this.data.selectedHomeId, selectedHome);
  },

  refreshReport() {
    const results = this.data.scanResults || {};
    const completedCount = Object.keys(results).filter((key) => results[key] && results[key].completedAt).length;
    const progress = Math.round((completedCount / steps.length) * 100);
    const scores = Object.values(results)
      .map((result) => result.score)
      .filter((score) => typeof score === "number");
    const score = scores.length
      ? Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length)
      : completedCount ? Math.max(60, 92 - (steps.length - completedCount) * 4) : "待分析";
    const advice = completedCount
      ? `已完成 ${completedCount} 项检测，建议继续补齐未检测项后再决定是否签约。`
      : "完成现场检测后，这里会汇总当前房源风险。";
    this.setData({ completedCount, progress, score, advice });
  }
});
