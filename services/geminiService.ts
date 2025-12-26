
import { GoogleGenAI } from "@google/genai";
import { GameState, Coordinates, Building } from '../types';
import { LocationInfo } from './mapDataService';

let ai: GoogleGenAI | null = null;

const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (key && key !== 'undefined' && key !== 'your_api_key_here') {
  ai = new GoogleGenAI({ 
    apiKey: key,
  });
}

export const generateRadioChatter = async (
  gameState: GameState, 
  location: Coordinates,
  event: 'START' | 'RESCUE' | 'WAVE_CLEARED' | 'LOW_HEALTH' | 'RANDOM' | 'DISCOVERY',
  locationInfo?: any // LocationInfo type from mapDataService
): Promise<string> => {
  if (!ai) return "指挥中心连接中断（API Key未配置或无效）...";

  const { healthyCount, infectedCount, soldierCount } = gameState;
  const loc = locationInfo || { name: '未知区域' };
  
  const envDetail = [
    loc.road ? `街道: ${loc.road}` : null,
    loc.feature ? `地标/建筑: ${loc.feature}` : null,
    loc.suburb ? `区域: ${loc.suburb}` : null,
    loc.type ? `环境类型: ${loc.type}` : null
  ].filter(Boolean).join(', ');

  const systemPrompt = `你是一个写实风格丧尸爆发模拟游戏的文案生成器。
  当前环境信息: ${loc.name}. ${envDetail ? `详细上下文: ${envDetail}` : ''}.
  生存者: ${healthyCount}, 感染者: ${infectedCount}, 作战部队: ${soldierCount}.
  规则: 
  1. 必须根据提供的地理位置、街道或建筑名称构建对话。
  2. 语气要逼真且具有沉浸感（紧张、绝望或冷酷的军事风）。
  3. 严禁使用通用模板。必须提及具体的环境细节（如“在${loc.road || '这条街'}拐角”、“靠近${loc.feature || '建筑'}”）。
  4. 只有1句话，简洁有力。`;

  const eventPrompts = {
    START: "作为指挥官宣布疫情爆发。",
    RESCUE: "作为飞行员或部队负责人确认抵达目标区。",
    WAVE_CLEARED: "作为高层宣布区域暂时肃清。",
    LOW_HEALTH: "作为情报员警告感染失控。",
    RANDOM: "作为前线士兵或幸存者进行随机无线电报告，必须描述当前看到的街道环境和僵尸活动。",
    DISCOVERY: "作为情报员，报告在该地标或街道首次发现感染者，语气急迫。"
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n任务: ${eventPrompts[event]}` }] }]
    });
    return response.text?.trim() || "信号干扰...";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "通讯链路不稳定";
  }
};

export const generateTacticalAnalysis = async (
  building: Building,
  nearbyFeatures: string[],
  locationInfo: LocationInfo | null,
  nearbyStats: { zombies: number; soldiers: number; civilians: number }
): Promise<{ survivalGuide: string; tacticalReport: string }> => {
  if (!ai) {
    return {
      survivalGuide: "AI扫描离线。API Key未配置或无效。",
      tacticalReport: `周边侦测到${nearbyStats.zombies}个感染者，${nearbyStats.soldiers}名士兵和${nearbyStats.civilians}名平民。无法提供战术建议。`
    };
  }

  const landmarks = nearbyFeatures.length > 0 ? nearbyFeatures.slice(0, 5).join('、') : "无明显地标";
  const road = locationInfo?.road || "未知街道";
  const context = `建筑名称: ${building.name}, 类型: ${building.type}, 街道: ${road}. 周边地标: ${landmarks}.
  实时敌我态势: ${nearbyStats.zombies}个僵尸, ${nearbyStats.soldiers}名士兵, ${nearbyStats.civilians}名平民.`;

  const systemPrompt = `你是一个写实风格丧尸模拟游戏的AI战术侦察系统。
  你需要基于地理位置、街道名、周边真实地标和实时敌我态势，生成两段简短的报告。
  注意：内容必须具体！必须提到具体的街道或地标！
  
  要求：
  1. 生存指南 (Survival Guide): 1-2句话。分析建筑本身的防御价值，结合真实街道名或地标给出撤离/固守建议。
  2. 实战报告 (Tactical Report): 1-2句话。根据当前的僵尸和士兵数量，给出直接的军事建议，参考周边地标作为防线或阻击点。
  
  语气：冷峻、专业、充满科技感。
  语言：中文。输出格式必须是JSON: {"survivalGuide": "...", "tacticalReport": "..."}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n当前上下文: ${context}` }] }],
      config: { responseMimeType: "application/json" }
    });
    
    let text = response.text || '{"survivalGuide": "数据解码失败", "tacticalReport": "扫描中断"}';
    // Handle cases where Gemini might wrap the JSON in markdown code blocks
    if (text.includes("```json")) {
        text = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
        text = text.split("```")[1].split("```")[0].trim();
    }
    
    const result = JSON.parse(text);
    return result;
  } catch (error) {
    console.error("Gemini Tactical Analysis Error:", error);
    return {
      survivalGuide: "由于电磁干扰，详细指南无法生成。请根据通用生存手册行动。",
      tacticalReport: `备用扫描结果：周边有${nearbyStats.zombies}个目标。建议保持隐蔽。`
    };
  }
};
