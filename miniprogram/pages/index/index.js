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
    method: "拍照 + 噪音描述",
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

const signingGroups = [
  {
    title: "费用类",
    items: ["月租是否包含物业费、网费、管理费？", "水电燃气怎么计费？", "是否民水民电？", "是否有中介费/服务费？", "押几付几？", "押金什么时候退？"]
  },
  {
    title: "退租类",
    items: ["能否提前退租？", "提前退租扣多少钱？", "能否转租？", "找到下家后是否能退押金？"]
  },
  {
    title: "维修类",
    items: ["家电坏了谁修？", "管道堵塞谁负责？", "墙面返潮/漏水谁负责？", "维修响应时间多久？"]
  },
  {
    title: "交付类",
    items: ["家具有哪些？", "哪些东西已有损坏？", "是否有交付清单？", "房东承诺维修的内容什么时候完成？"]
  },
  {
    title: "身份类",
    items: ["房东是否为产权人？", "是否二房东？", "是否能看房产证/委托书？", "合租的话室友是否固定？"]
  },
  {
    title: "居住规则类",
    items: ["能否养宠物？", "能否做饭？", "能否留宿？", "是否限电限水？", "是否可以办居住证？"]
  },
  {
    title: "安全类",
    items: ["门锁能否更换？", "是否有消防隐患？", "是否隔断房？", "是否群租房？"]
  }
];

function getResult(results, stepId) {
  return results && results[stepId] ? results[stepId] : null;
}

function createHomeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    stepViews: [],
    currentStepIndex: 0,
    currentStep: steps[0],
    fieldNote: "",
    scanResults: {},
    currentPhotos: [],
    currentResult: null,
    aiLoading: false,
    homeAnalysisLoading: false,
    homeAnalysis: null,
    signingAnalysisLoading: false,
    signingAnalysis: null,
    signingGroups,
    signingViewGroups: [],
    expandedSigningGroup: "",
    expandedSigningQuestion: "",
    signingState: {},
    signingDetails: {},
    signingProgress: 0,
    askedCount: 0,
    completedCount: 0,
    progress: 0,
    score: "待分析",
    advice: "完成现场检测后，这里会汇总当前房源风险。"
  },

  onLoad() {
    const homes = wx.getStorageSync(STORAGE_KEY) || [];
    const selectedHomeId = homes.length ? homes[0].id : "";
    const signingState = wx.getStorageSync(`${STORAGE_KEY}_signing`) || {};
    const signingDetails = wx.getStorageSync(`${STORAGE_KEY}_signing_details`) || {};
    this.setData({ homes, selectedHomeId, signingState, signingDetails });
    this.refreshSelectedHome();
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab });
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  updateFieldNote(event) {
    this.setData({ fieldNote: event.detail.value });
  },

  persistLocalFile(tempFilePath) {
    return new Promise((resolve) => {
      if (!tempFilePath) {
        resolve("");
        return;
      }
      wx.saveFile({
        tempFilePath,
        success: (res) => resolve(res.savedFilePath || tempFilePath),
        fail: () => resolve(tempFilePath)
      });
    });
  },

  chooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: async (res) => {
        const savedPath = await this.persistLocalFile(res.tempFiles[0].tempFilePath);
        this.setData({ "form.photo": savedPath });
      }
    });
  },

  saveHome() {
    const id = this.data.selectedHomeId || createHomeId();
    const nextHome = {
      ...this.data.form,
      id,
      results: this.data.scanResults,
      analysis: this.data.homeAnalysis,
      signingAnalysis: this.data.signingAnalysis
    };
    const homes = this.data.homes.filter((home) => home.id !== id);
    homes.unshift(nextHome);
    wx.setStorageSync(STORAGE_KEY, homes);
    this.setData({ homes, selectedHomeId: id });
    this.refreshSelectedHome();
    wx.showToast({ title: "已保存", icon: "success" });
  },

  newHome() {
    this.setData({
      form: {
        name: "",
        rent: "",
        commute: "",
        location: "",
        note: "",
        photo: ""
      },
      selectedHomeId: "",
      selectedHome: null,
      scanResults: {},
      currentResult: null,
      currentPhotos: [],
      fieldNote: "",
      homeAnalysis: null,
      signingAnalysis: null,
      expandedSigningGroup: "",
      expandedSigningQuestion: ""
    });
    this.refreshReport();
    wx.showToast({ title: "已新建房源", icon: "none" });
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
      homeAnalysis: selectedHome.analysis || null,
      signingAnalysis: selectedHome.signingAnalysis || null,
      currentResult,
      currentPhotos: currentResult ? currentResult.photos || [] : [],
      fieldNote: currentResult ? currentResult.note || "" : "",
      expandedSigningGroup: "",
      expandedSigningQuestion: ""
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
      success: async (res) => {
        const step = this.data.currentStep;
        const existing = getResult(this.data.scanResults, step.id)?.photos || [];
        const savedFiles = await Promise.all(res.tempFiles.map((file) => this.persistLocalFile(file.tempFilePath)));
        const photos = savedFiles.map((filePath, index) => ({
          url: filePath,
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
    if (this.data.aiLoading) return;

    const step = this.data.currentStep;
    const existing = getResult(this.data.scanResults, step.id) || {};
    if (existing.ai && (this.data.fieldNote || "") === (existing.note || "")) {
      this.setData({
        activeTab: "checklist",
        currentResult: existing,
        currentPhotos: existing.photos || []
      });
      wx.showToast({ title: "已有分析结果", icon: "none" });
      return;
    }
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
          source: "微信小程序现场检测",
          note: step.id === "window" ? "噪音使用文字描述，不使用录音分贝。" : ""
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

  setSigningStatus(key, status) {
    if (!this.data.selectedHomeId) {
      wx.showToast({ title: "请先选择房源", icon: "none" });
      return;
    }
    const signingState = { ...this.data.signingState, [key]: status };
    wx.setStorageSync(`${STORAGE_KEY}_signing`, signingState);
    this.setData({ signingState });
    this.refreshReport();
  },

  markSigningAsked(event) {
    this.setSigningStatus(event.currentTarget.dataset.key, "已问过");
  },

  markSigningEvidence(event) {
    this.setSigningStatus(event.currentTarget.dataset.key, "已留证");
  },

  resetSigningItem(event) {
    this.setSigningStatus(event.currentTarget.dataset.key, "待确认");
  },

  toggleSigningGroup(event) {
    const title = event.currentTarget.dataset.title;
    this.setData({
      expandedSigningGroup: this.data.expandedSigningGroup === title ? "" : title,
      expandedSigningQuestion: ""
    });
  },

  toggleSigningQuestion(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      expandedSigningQuestion: this.data.expandedSigningQuestion === key ? "" : key
    });
  },

  saveSigningDetails(signingDetails) {
    wx.setStorageSync(`${STORAGE_KEY}_signing_details`, signingDetails);
    this.setData({ signingDetails });
    this.refreshReport();
  },

  updateSigningAnswer(event) {
    const key = event.currentTarget.dataset.key;
    const current = this.data.signingDetails[key] || {};
    const signingDetails = {
      ...this.data.signingDetails,
      [key]: {
        ...current,
        answer: event.detail.value
      }
    };
    this.saveSigningDetails(signingDetails);
  },

  toggleSigningWritten(event) {
    const key = event.currentTarget.dataset.key;
    const current = this.data.signingDetails[key] || {};
    const signingDetails = {
      ...this.data.signingDetails,
      [key]: {
        ...current,
        writtenInContract: !current.writtenInContract
      }
    };
    this.saveSigningDetails(signingDetails);
  },

  chooseSigningEvidence(event) {
    const key = event.currentTarget.dataset.key;
    wx.chooseMedia({
      count: 4,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: async (res) => {
        const current = this.data.signingDetails[key] || {};
        const existing = current.evidence || [];
        const savedFiles = await Promise.all(res.tempFiles.map((file) => this.persistLocalFile(file.tempFilePath)));
        const evidence = existing.concat(savedFiles.map((filePath, index) => ({
          url: filePath,
          label: `留证 ${existing.length + index + 1}`
        })));
        const signingDetails = {
          ...this.data.signingDetails,
          [key]: {
            ...current,
            evidence
          }
        };
        this.saveSigningDetails(signingDetails);
        this.setSigningStatus(key, "已留证");
      }
    });
  },

  deleteSigningEvidence(event) {
    const key = event.currentTarget.dataset.key;
    const index = Number(event.currentTarget.dataset.index);
    const current = this.data.signingDetails[key] || {};
    const evidence = [...(current.evidence || [])];
    evidence.splice(index, 1);
    const signingDetails = {
      ...this.data.signingDetails,
      [key]: {
        ...current,
        evidence
      }
    };
    this.saveSigningDetails(signingDetails);
  },

  buildSigningItems() {
    return signingGroups.flatMap((group) =>
      group.items.map((item) => {
        const key = `${this.data.selectedHomeId}:${item}`;
        const detail = this.data.signingDetails[key] || {};
        return {
          group: group.title,
          question: item,
          status: this.data.signingState[key] || "待确认",
          answer: detail.answer || "",
          writtenInContract: Boolean(detail.writtenInContract),
          evidenceCount: (detail.evidence || []).length
        };
      })
    );
  },

  async generateSigningAnalysis() {
    if (!this.data.selectedHomeId) {
      wx.showToast({ title: "请先选择房源", icon: "none" });
      return;
    }
    if (this.data.signingAnalysisLoading) return;
    if (this.data.signingAnalysis) {
      wx.showToast({ title: "已有签约分析", icon: "none" });
      return;
    }
    this.setData({ signingAnalysisLoading: true });
    wx.showLoading({ title: "分析签约风险" });

    try {
      const result = await this.analyzeSigning();
      this.setData({ signingAnalysis: result });
      const homes = this.data.homes.map((home) => {
        if (home.id !== this.data.selectedHomeId) return home;
        return { ...home, signingAnalysis: result };
      });
      wx.setStorageSync(STORAGE_KEY, homes);
      this.setData({ homes });
      wx.hideLoading();
      this.setData({ signingAnalysisLoading: false });
      wx.showToast({ title: "签约分析完成", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      this.setData({ signingAnalysisLoading: false });
      console.error("Signing analysis failed:", error);
      wx.showToast({ title: "签约分析失败", icon: "none" });
    }
  },

  analyzeSigning() {
    const results = Object.values(this.data.scanResults || {});
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE}/api/ai/analyze`,
        method: "POST",
        header: {
          "Content-Type": "application/json",
          "X-RentLens-User": "wechat_demo_openid"
        },
        data: {
          skill: "anti_trap_check",
          home: {
            name: this.data.form.name,
            rent: this.data.form.rent,
            location: this.data.form.location,
            commute: this.data.form.commute,
            note: this.data.form.note
          },
          inspectionResults: results.map((item) => ({
            name: item.name,
            method: item.method,
            note: item.note,
            ai: item.ai || null,
            photosCount: (item.photos || []).length
          })),
          signingChecklist: this.buildSigningItems(),
          context: {
            source: "微信小程序签约前提醒",
            instruction: "用户没有输入回答时，请分析缺失风险；用户输入了房东回答、合同状态或证据数量时，请判断是否存在口头承诺、模糊条款、押金和退租风险。"
          }
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.result) {
            resolve(res.data.result);
            return;
          }
          console.error("Signing analysis response error:", res.statusCode, res.data);
          reject(new Error((res.data && res.data.error) || `HTTP ${res.statusCode}`));
        },
        fail: reject
      });
    });
  },

  async generateHomeAnalysis() {
    if (!this.data.selectedHomeId) {
      wx.showToast({ title: "请先选择房源", icon: "none" });
      return;
    }
    if (this.data.homeAnalysisLoading) return;
    if (this.data.homeAnalysis) {
      wx.showToast({ title: "已有房源分析", icon: "none" });
      return;
    }
    this.setData({ homeAnalysisLoading: true });
    wx.showLoading({ title: "生成分析中" });

    try {
      const result = await this.analyzeHome();
      this.setData({
        homeAnalysis: result,
        score: typeof result.overallScore === "number" ? result.overallScore : this.data.score,
        advice: result.summary || this.data.advice
      });
      const homes = this.data.homes.map((home) => {
        if (home.id !== this.data.selectedHomeId) return home;
        return { ...home, analysis: result };
      });
      wx.setStorageSync(STORAGE_KEY, homes);
      this.setData({ homes });
      wx.hideLoading();
      this.setData({ homeAnalysisLoading: false });
      wx.showToast({ title: "已生成分析", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      this.setData({ homeAnalysisLoading: false });
      console.error("Home analysis failed:", error);
      wx.showToast({ title: "房源分析失败", icon: "none" });
    }
  },

  analyzeHome() {
    const results = Object.values(this.data.scanResults || {});
    const signingItems = this.buildSigningItems();

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${API_BASE}/api/ai/analyze`,
        method: "POST",
        header: {
          "Content-Type": "application/json",
          "X-RentLens-User": "wechat_demo_openid"
        },
        data: {
          skill: "home_analysis",
          home: {
            name: this.data.form.name,
            rent: this.data.form.rent,
            location: this.data.form.location,
            commute: this.data.form.commute,
            note: this.data.form.note
          },
          inspectionResults: results.map((item) => ({
            name: item.name,
            method: item.method,
            note: item.note,
            completedAt: item.completedAt,
            ai: item.ai || null,
            score: item.score || null,
            photosCount: (item.photos || []).length
          })),
          signingChecklist: signingItems,
          context: {
            source: "微信小程序房源分析"
          }
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.result) {
            resolve(res.data.result);
            return;
          }
          console.error("Home analysis response error:", res.statusCode, res.data);
          reject(new Error((res.data && res.data.error) || `HTTP ${res.statusCode}`));
        },
        fail: reject
      });
    });
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
    const score = this.data.homeAnalysis && typeof this.data.homeAnalysis.overallScore === "number"
      ? this.data.homeAnalysis.overallScore
      : scores.length
      ? Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length)
      : completedCount ? Math.max(60, 92 - (steps.length - completedCount) * 4) : "待分析";
    const advice = this.data.homeAnalysis && this.data.homeAnalysis.summary
      ? this.data.homeAnalysis.summary
      : completedCount
      ? `已完成 ${completedCount} 项检测，建议继续补齐未检测项后再决定是否签约。`
      : "完成现场检测后，这里会汇总当前房源风险。";
    const signingKeys = signingGroups.flatMap((group) => group.items.map((item) => `${this.data.selectedHomeId}:${item}`));
    const signedCount = signingKeys.filter((key) => this.data.signingState[key] === "已留证").length;
    const askedCount = signingKeys.filter((key) => this.data.signingState[key] === "已问过" || this.data.signingState[key] === "已留证").length;
    const signingProgress = signingKeys.length ? Math.round((signedCount / signingKeys.length) * 100) : 0;
    const signingViewGroups = signingGroups.map((group) => ({
      title: group.title,
      confirmedCount: group.items.filter((question) => this.data.signingState[`${this.data.selectedHomeId}:${question}`] === "已留证").length,
      askedCount: group.items.filter((question) => {
        const status = this.data.signingState[`${this.data.selectedHomeId}:${question}`];
        return status === "已问过" || status === "已留证";
      }).length,
      totalCount: group.items.length,
      items: group.items.map((question) => {
        const key = `${this.data.selectedHomeId}:${question}`;
        const detail = this.data.signingDetails[key] || {};
        return {
          key,
          question,
          status: this.data.signingState[key] || "待确认",
          answer: detail.answer || "",
          writtenInContract: Boolean(detail.writtenInContract),
          evidence: detail.evidence || [],
          evidenceCount: (detail.evidence || []).length
        };
      })
    }));
    const stepViews = steps.map((step) => {
      const result = results[step.id] || null;
      const ai = result && result.ai ? result.ai : null;
      return {
        ...step,
        recorded: !!result,
        ai,
        level: ai ? ai.level : result ? "待分析" : "未检测",
        reportStatus: ai ? ai.level : result ? "已记录" : "待检测"
      };
    });
    this.setData({ completedCount, progress, score, advice, signingProgress, signingViewGroups, stepViews, askedCount });
  }
});
