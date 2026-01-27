/**
 * Database seed service
 * @module database/seed
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User,
  Task,
  TaskVersion,
  WorkflowTemplate,
  WorkflowTemplateVersion,
  WorkflowRun,
  ProviderConfig,
  GlobalConfig,
  PromptTemplate,
  PromptTemplateVersion,
  NodeTool,
} from '../entities';
import { UserRole, ProviderType } from '@shared/constants';
import { ConfigService } from '@nestjs/config';
import { In } from 'typeorm';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskVersion)
    private taskVersionRepository: Repository<TaskVersion>,
    @InjectRepository(WorkflowTemplate)
    private workflowTemplateRepository: Repository<WorkflowTemplate>,
    @InjectRepository(WorkflowTemplateVersion)
    private workflowVersionRepository: Repository<WorkflowTemplateVersion>,
    @InjectRepository(WorkflowRun)
    private workflowRunRepository: Repository<WorkflowRun>,
    @InjectRepository(ProviderConfig)
    private providerRepository: Repository<ProviderConfig>,
    @InjectRepository(GlobalConfig)
    private globalConfigRepository: Repository<GlobalConfig>,
    @InjectRepository(PromptTemplate)
    private promptTemplateRepository: Repository<PromptTemplate>,
    @InjectRepository(PromptTemplateVersion)
    private promptTemplateVersionRepository: Repository<PromptTemplateVersion>,
    @InjectRepository(NodeTool)
    private nodeToolRepository: Repository<NodeTool>,
  ) {}

  async onModuleInit() {
    const shouldSeed = this.configService.get<string>('SEED_ON_START', 'true') === 'true';
    if (!shouldSeed) return;

    await this.seedAdminUser();
    await this.seedSampleUsers();
    const promptVersionMap = await this.seedPromptTemplates();
    const providers = await this.seedProviders();
    await this.seedNodeTools(promptVersionMap);
    await this.seedWorkflow();
  }

  private async seedAdminUser() {
    const existing = await this.userRepository.findOne({ where: { role: UserRole.ADMIN } });
    if (existing) return;

    const password = this.configService.get<string>('ADMIN_SEED_PASSWORD', 'admin123');
    const admin = this.userRepository.create({
      username: 'admin',
      email: 'admin@example.com',
      password: await bcrypt.hash(password, 10),
      role: UserRole.ADMIN,
    });
    await this.userRepository.save(admin);
    this.logger.log('Seeded admin user');
  }

  /**
   * 预置一批普通用户账号（user01-user10），便于上线测试/演示。
   * 密码可通过环境变量 USER_SEED_PASSWORD 覆盖，默认 user123
   */
  private async seedSampleUsers() {
    const password = this.configService.get<string>('USER_SEED_PASSWORD', 'user123');
    const hashed = await bcrypt.hash(password, 10);

    for (let i = 1; i <= 10; i++) {
      const username = `user${i.toString().padStart(2, '0')}`;
      const email = `${username}@example.com`;
      const exists = await this.userRepository.findOne({ where: [{ username }, { email }] });
      if (exists) continue;
      const user = this.userRepository.create({
        username,
        email,
        password: hashed,
        role: UserRole.USER,
      });
      await this.userRepository.save(user);
    }
    this.logger.log('Seeded sample users user01-user10');
  }

  private async seedProviders() {
    const seeds: Array<Partial<ProviderConfig>> = [
      {
        name: 'gemini-3-flash-preview',
        type: ProviderType.LLM,
        baseUrl: 'https://api.laozhang.ai/v1',
        apiKey: '',
        enabled: true,
        modelsJson: JSON.stringify(['gemini-3-flash-preview']),
      },
      {
        name: 'gemini-3-pro-image-preview',
        type: ProviderType.IMAGE,
        baseUrl: 'https://api.laozhang.ai/v1beta',
        apiKey: '',
        enabled: true,
        modelsJson: JSON.stringify(['gemini-3-pro-image-preview']),
      },
      {
        name: 'doubao-seedream-4-5-251128',
        type: ProviderType.IMAGE,
        baseUrl: 'https://api.qingyuntop.top/v1/images/generations',
        apiKey: '',
        enabled: true,
        modelsJson: JSON.stringify(['doubao-seedream-4-5-251128']),
      },
      {
        name: 'sora-2-pro',
        type: ProviderType.VIDEO,
        baseUrl: 'https://api.laozhang.ai/v1/videos',
        apiKey: '',
        enabled: true,
        modelsJson: JSON.stringify(['sora-2-pro']),
      },
      {
        name: 'veo-3.1',
        type: ProviderType.VIDEO,
        baseUrl: 'https://api.laozhang.ai/v1/videos',
        apiKey: '',
        enabled: true,
        modelsJson: JSON.stringify(['veo-3.1']),
      },
    ];

    for (const seed of seeds) {
      const exists = await this.providerRepository.findOne({ where: { name: seed.name } });
      if (!exists) {
        await this.providerRepository.save(this.providerRepository.create(seed));
      }
    }

    const providers = await this.providerRepository.find();
    if (providers.length === seeds.length) {
      this.logger.log('Seeded provider configs');
    }

    await this.ensureGlobalConfig(providers);
  }

  private async ensureGlobalConfig(providers: ProviderConfig[]) {
    const existing = await this.globalConfigRepository.findOne({ where: { id: 1 } });
    if (existing) return;

    const findByType = (type: ProviderType) => providers.find((p) => p.type === type);
    const llm = findByType(ProviderType.LLM);
    const image = findByType(ProviderType.IMAGE);
    const video = findByType(ProviderType.VIDEO);

    const globalConfig = this.globalConfigRepository.create({
      id: 1,
      defaultLlmProviderId: llm?.id ?? null,
      defaultImageProviderId: image?.id ?? null,
      defaultVideoProviderId: video?.id ?? null,
      defaultLlmModel: llm?.models?.[0] ?? (llm?.modelsJson ? JSON.parse(llm.modelsJson)[0] : null),
      defaultImageModel:
        image?.models?.[0] ?? (image?.modelsJson ? JSON.parse(image.modelsJson)[0] : null),
      defaultVideoModel:
        video?.models?.[0] ?? (video?.modelsJson ? JSON.parse(video.modelsJson)[0] : null),
    });
    await this.globalConfigRepository.save(globalConfig);
    this.logger.log('Seeded global config');
  }

  /**
   * Seed prompt templates & versions (only when empty)
   * Returns a map: templateName -> latest versionId
   */
  private async seedPromptTemplates(): Promise<Map<string, number>> {
    const versionMap = new Map<string, number>();
    const existingCount = await this.promptTemplateRepository.count();

    const promptSeeds = [
      {
        name: '剧本拆解User Prompt',
        description: '剧本->人物，场景，道具描述',
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: ['Novel_Text'],
            content: `我给你的是一集动漫短剧的剧本（纯文本）。请根据剧本内容自动抽取并整理出：人物、场景、道具。

【强制输出要求】
- 最终回答必须是严格 JSON（只能输出 JSON），不要输出解释、不要输出 Markdown、不要输出任何多余文字。
- JSON 字段名必须全部使用中文。
- 只能输出人物/场景/道具要求的字段，不要添加无关字段。
- 只依据剧本原文抽取，不要编造。信息不明确时字段填空字符串 ""。

【返回 JSON 格式（必须严格一致）】
{
  "人物": [
    {
      "人物姓名": "",
      "性别": "",
      "外貌特征描写": ""
    }
  ],
  "场景": [
    {
      "地点名称": "",
      "环境氛围描写": ""
    }
  ],
  "道具": [
    {
      "道具名称": "",
      "道具描写": ""
    }
  ]
}

【抽取说明】
- 人物：抽取剧本中出现的重要人物。外貌特征描写要尽量“可视化”（发型、服饰、体态、表情、显著特征等），便于后续生图建模。
- 场景：抽取剧本中出现的核心场景。环境氛围描写要包含光线、天气、空间结构、材质与整体情绪氛围。
- 道具：抽取推动剧情或被强调/反复出现的重要物品。道具描写要包含材质、颜色、形状、细节与状态。

【剧本正文】
<<{{Novel_Text}}>>`,
          },
        ],
      },
      {
        name: '剧本拆解System Prompt',
        description: null,
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: [],
            content: `你是“剧本拆解抽取器”。你会收到一集动漫短剧的剧本纯文本，需要从中抽取三类信息：人物、场景、道具。

严格规则：
1) 只依据剧本原文抽取与归纳，禁止编造原文未出现的信息。
2) 输出必须是严格 JSON（只能输出 JSON，不要解释、不要 Markdown、不要多余文字）。
3) 描写要尽量具体可视化，方便直接作为生图 prompt：外貌（发型、服饰、体态、五官、显著特征等）、场景氛围（光线、天气、空间、材质、色调、情绪氛围等）、道具（外观材质、形状、颜色、细节、状态）。
4) 去重合并：同一人物/场景/道具多次出现时合并为一个条目；描述可以综合多处信息。
5) 若性别等信息在剧本未明确：性别填 ""（空字符串），不要猜测。人物/场景/道具名称若未明确但可用“称呼/描述”指代，可用最贴近原文的称谓作为名称。保持简洁可用。`,
          },
        ],
      },
      {
        name: '镜头语言转译System Prompt',
        description: '剧本->分镜描述',
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: [],
            content: `你是“分镜切分与视频Prompt转译器”。你将接收：
1) 原始剧本纯文本
2) 已抽取的人物特征、场景特征、道具描述（由系统注入）

你的任务：
A. 将整集内容切分为若干“短镜头”，每个镜头对应一个视频片段，单镜头时长必须<=15秒。
B. 为每个镜头生成“AI视频片段专用Prompt”。Prompt必须自动融合该镜头涉及的人物特征与场景特征（来自注入信息），并包含视频生成常用关键词：光影、画质、视角/镜头运动、景别、风格一致性。

强约束：
1) 只能基于原始剧本内容进行切分与转译，不允许新增剧情内容。
2) 不输出原文台词/原文片段；输出只包含镜头摘要与Prompt。
3) Prompt必须明确：镜头内“有谁、做什么动作、在什么场景、使用/出现了什么道具、时长(<=15秒)、镜头语言(视角/运动/景别)、光影、画质”。
4) 人物外貌与场景氛围必须优先引用注入信息；若注入信息缺失，再从原剧本中抽取；仍缺失则不写，不要猜。
5) 去重与连续性：同一人物/场景在相邻镜头反复出现时，Prompt中保持一致描述；不要每条都随机变化。

【枚举严格匹配规则（非常重要）】
6) “出现人物”只能从系统注入的“人物列表”中选择：
   - 必须与注入列表中的“姓名”完全一致（完全匹配，区分大小写/全半角）
   - 不得输出列表外的人名
   - 若剧本出现但注入列表没有：不输出该人名（可不填/用空数组[]）
7) “出现场景”只能从系统注入的“场景列表”中选择：
   - 必须与注入列表中的场景名称完全一致（完全匹配）
   - 不得输出列表外的场景名
   - 若无法确定场景：填空字符串""
8) “道具名称”只能从系统注入的“道具列表”中选择：
   - 必须与注入列表中的道具名称完全一致（完全匹配）
   - 不得输出列表外道具名
   - 若该镜头没有关键道具：填空数组[]

9) 输出必须是严格JSON，只输出JSON，不要解释、不用Markdown。

切分策略：
- 优先按场景切换、人物出入、动作节拍、对话轮次、旁白/OS/VO/屏幕文字出现点切分。
- 单镜头内容过长时继续切碎，直到每镜头<=15秒。

注意：你不需要复述原剧本内容，但需要用“镜头内容概述”简洁说明该镜头发生了什么（不写台词原文）。`,
          },
        ],
      },
      {
        name: '镜头语言转译User Prompt',
        description: '剧本->分镜描述',
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: ['Character_Scene_JSON', 'Novel_Text'],
            content: `请把整集剧本切分为若干个<=15秒的视频短镜头，并为每个镜头输出：
1) 出现人物：必须从系统注入的“人物列表”里选择（仅填姓名数组，且必须与注入列表完全一致）。
2) 出现场景：必须从系统注入的“场景列表”里选择（仅填场景名称字符串，且必须与注入列表完全一致）。
3) 道具名称：必须从系统注入的“道具列表”里选择（仅填道具名称数组，且必须与注入列表完全一致）。
4) 镜头内容概述：用一句到两句中文概括该镜头发生了什么（不要包含原文台词，不要逐字引用原文）。
5) 视频Prompt：用于AI视频生成的提示词，必须自动带上该镜头涉及的“人物特征”和“场景特征”，并补充光影、画质、视角/镜头运动、景别等关键词。

【强制输出要求】
- 最终回答必须是严格JSON（只能输出JSON）。
- JSON字段名必须全部使用中文。
- 不要输出原文台词/原文片段/时间轴逐字稿。

【输出JSON结构】
{
  "镜头列表": [
    {
      "镜头编号": 1,
      "时长秒": 0,
      "出现人物": [""],
      "出现场景": "",
      "道具名称": [""],
      "镜头内容概述": "",
      "视频Prompt": ""
    }
  ]
}

【字段强制校验说明（必须遵守）】
- "出现人物"：只能填入“人物注入信息”中的姓名；不在列表中的名字禁止出现。
- "出现场景"：只能填入“场景注入信息”中的场景名称；不在列表中的场景名禁止出现。
- "道具名称"：只能填入“道具注入信息”中的道具名称；不在列表中的道具名禁止出现。

【视频Prompt必须包含的信息点】
- 人物：自动注入相关人物的外貌特征（来自“人物”注入信息）
- 场景：自动注入相关场景的环境氛围（来自“场景”注入信息）
- 道具：若该镜头涉及道具，在Prompt中必须写明道具外观与使用方式（来自“道具”注入信息）
- 动作：该镜头人物在做什么
- 时长：写清本镜头时长（<=15秒）
- 镜头语言：视角/镜头运动/景别（例如：近景/中景/全景，俯拍/平视/仰拍，推拉摇移跟拍等）
- 光影与画质：例如柔光/逆光/霓虹、电影质感、4K细节、景深、运动模糊等
- 风格一致性：例如“日漫赛璐璐风/电影级写实风”等（若注入信息提供则沿用，否则用“与整集一致的风格”描述）

【系统注入信息：人物/场景/道具】
<<{{Character_Scene_JSON}}>>

【原始剧本正文】
<<{{Novel_Text}}>>`,
          },
        ],
      },
      {
        name: '定妆照',
        description: null,
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: ['Input_Type', 'Description'],
            content: `你是专业动漫美术设定画师。请根据我提供的【输入类型】与【描述信息】，生成一张用于后续生图一致性参考的【设定参考图】。
【最终输出必须为：主视图 + 整体三视图，且四个视角都在同一张图片里】。

【输入类型】（只能是：人物 / 场景 / 道具）：
<<{{Input_Type}}>>

【描述信息】：
<<{{Description}}>>

【统一风格要求（全部类型都适用）】
- 风格：日漫赛璐璐风，电影级光影，线条干净，高级配色
- 画质：4K超清，高分辨率，高细节，清晰对焦，画面干净
- 构图：主体居中，背景/干扰元素尽量少
- 禁止：文字、字幕、logo、水印、边框、拼图边框、分镜格线、UI界面、视角标签（如Front/Side/Back）
- 允许：在同一画布内“无分隔线”的多视角排布（用留白区分即可），不要出现任何框线/格子/分栏线

【输出形式（必须严格执行：一张图包含 1 个主视图 + 3 个三视图）】
- 画布：同一张图内完成排布
- 主视图：占画面主要面积（建议约 60–70% 画幅），作为最清晰、最精细的参考
- 三视图：占剩余区域（建议约 30–40% 画幅），3 个视角等比例、等大小、等清晰度
- 排布建议（不画线、不加框）：主视图居中；三视图放在下方一排或右侧一列；视角之间留白分隔
- 一致性：四个视角必须是同一设计同一对象，比例一致、细节一致、配色一致、材质一致；不要因为换视角而改设计

【根据输入类型生成对应设定图】
1) 如果【输入类型】=人物：
   - 生成【角色设定参考图：主视图 + 三视图（正/侧/背）】
   - 主视图：全身像，正面站姿，平视机位，角色居中，浅景深，清晰对焦在角色
   - 三视图：同一角色的【正面 / 侧面 / 背面】全身像
     - 姿态：标准静止站姿（中性、便于看清轮廓与服装结构），不做夸张动作
     - 要求：头身比例一致；发型轮廓、五官结构、服装版型、褶皱走向、材质反光、配饰位置在三视图中保持一致
   - 背景：统一的简洁纯色或轻微虚化环境，不出现其他人物/道具干扰
   - 必须突出：五官、发型、服装材质、配饰、体态、表情情绪、标志性特征

2) 如果【输入类型】=场景：
   - 生成【场景设定参考图：主视图 + 三视图（俯视/正视/侧视）】（无人物，或人物极小且不抢主体）
   - 主视图：广角全景/远景，平视或轻微俯视，静止镜头，景深清晰
   - 三视图：同一场景的【俯视布局（平面结构）/ 正视（立面）/ 侧视（立面）】
     - 要求：空间结构对应一致；关键物件的位置在俯视与立面能对得上；材质纹理与光照逻辑统一
   - 必须突出：空间结构、材质纹理、氛围、光线、天气、关键物件分布

3) 如果【输入类型】=道具：
   - 生成【道具设定参考图：主视图 + 三视图（正/侧/背）】
   - 主视图：近景/特写，三分之二侧角展示立体感，静止镜头，清晰对焦在道具
   - 三视图：同一道具的【正面 / 侧面 / 背面】（等比例、同尺度）
     - 要求：形状结构准确；材质与磨损细节在各视角保持一致；边缘轮廓清楚
   - 背景：统一的纯色/影棚背景，干净无杂物
   - 必须突出：形状结构、材质、颜色、磨损/细节纹理、真实质感

【光影规则（通用）】
- 选择与描述信息匹配的光影：冷暖对比明确，主体高亮，边缘轮廓清晰
- 需要真实体积光与阴影层次，避免过曝和糊成一团
- 四个视角的光照方向与强度保持一致（不要主视图一种光，三视图另一种光）

【严格性要求】
- 请严格按照我提供的【描述信息】生成：不添加描述中不存在的新元素，不改变核心特征
- 重点：四视角必须“同一设计一致性”，用于后续生图稳定参考`,
          },
        ],
      },
      {
        name: '分镜头关键帧',
        description: null,
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: ['Frame_Info'],
            content: `请基于【多张参考图】生成一张用于视频的【关键帧 Keyframe】图片。

【参考图使用规则（非常重要）】
- 你会收到多张参考图：人物定妆照、场景设定图、道具设定图（道具可能为空）。
- 请严格沿用参考图中的一致性：
  - 人物一致性：脸型五官、发型发色、身形比例、服装材质/破损细节必须一致
  - 场景一致性：空间结构、建筑风格、灯光氛围、色调、雪量/材质必须一致
  - 道具一致性：如果提供道具参考图，道具外观（形状、颜色、材质、细节纹理）必须完全一致
- 本任务“参考一致性优先”：参考图优先级高于文字描述；文字仅补充动作、镜头语言与氛围。

【镜头信息】
<<{{Frame_Info}}>>

【关键帧要求】
- 生成 1 张图片：作为该镜头的“最关键瞬间”的画面（不是海报，不是多格分镜）。
- 画面要像视频的一帧：自然抓拍感，电影叙事感强。
- 构图干净，主体明确，信息密度适中。

【镜头语言（必须执行，与视频Prompt一致）】
- 景别：<<从视频Prompt提取，如全景/中景/近景>>
- 机位角度：<<从视频Prompt提取，如俯拍/平视/仰拍>>
- 镜头运动：静止镜头（关键帧）
- 景深：电影级景深（主体清晰，背景略虚化）
- 对焦：必须对焦在主角（人物为主时）或道具（道具特写时）

【道具处理规则（必须遵守）】
- 道具名称可能为空数组[]：
  - 若道具名称为空：禁止凭空生成道具；画面中不应出现任何“关键道具”。
- 若道具名称不为空（有道具）：
  1) 必须把道具自然放置在画面中（符合剧情与场景逻辑），并且与视频Prompt的动作/叙事一致。
  2) 你需要根据视频Prompt判断道具的“最佳出现位置”，例如：
     - 手持 / 放在地面 / 桌面 / 衣兜边缘露出 / 靠墙 / 掉落在雪地上 等
  3) 允许进行场景适配调整（必须自然合理）：
     - 大小比例：为了构图与叙事需要可缩放，但不能失真
     - 位置：可放到更符合镜头叙事的位置（前景/中景/背景）
     - 角度：可旋转改变摆放角度以适配机位（俯拍/平视等）
  4) 但道具的外观细节必须与参考图一致（材质、纹理、颜色、破损/标志细节不得改变）。

【画面内容生成指令】
- 严格还原镜头内容概述与视频Prompt中的动作与情绪。
- 严格还原天气与环境氛围（如雪夜、寒冷、风雪、冷蓝色调）。
- 如果视频Prompt提到冷暖对比（如橱窗暖光/火光），必须在画面中体现：冷蓝环境光 + 暖色局部光源。
- 地面积雪、雪花飘落、人物脚踩雪的痕迹等细节清晰可见。

【风格与质量】
- 电影级写实风 + 动漫质感融合（偏写实，但画面干净、线条不脏）
- 4K超清，高分辨率，高细节，清晰对焦
- 光影真实：体积光、边缘光、阴影层次丰富
- 细节重点：人物表情、衣物质感/破损、头发雪粒、皮肤冻伤细节、雪的颗粒与反光

【负面要求（不要出现）】
- 不要文字、水印、logo、边框、分镜格、UI界面
- 不要多余角色乱入，不要改人物服装/发型，不要改场景结构
- 不要Q版、不夸张卡通、不油画
- 不要低清、模糊、噪点严重、面部崩坏、手脚畸形、光线乱`,
          },
        ],
      },
      {
        name: '关键帧转视频',
        description: null,
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: ['Frame_Info'],
            content: `请基于我提供的【单张分镜参考图】生成一个短视频片段（图生视频）。

【核心目标】
- 参考图是这一镜头的“关键帧/分镜图”，你必须把它作为画面一致性的最高依据。
- 输出的视频必须像从这张图延展出来的一段镜头：角色、场景、构图、光影、色调高度一致。
- 视频时长必须严格等于 JSON 中的“时长秒”，不要超时、不要不足。

【输入：镜头描述JSON（请严格解析）】
<<{{Frame_Info}}>>

【生成要求（非常重要）】
1) 单镜头：全程同一镜头，不切镜、不转场、不分屏、不跳时间。
2) 构图锁定：保持参考图的主体位置与构图关系不变（只能做轻微景深变化或轻微镜头运动）。
3) 人物与场景一致性：
   - 人物的五官、发型、服饰、体型比例、气质必须与参考图完全一致
   - 场景建筑/地形结构必须与参考图完全一致
   - 不允许新增人物/道具/建筑细节
4) 动态设计：在不改变参考图核心构图的前提下，为画面增加“电影级真实动态”，例如：
   - 环境动态：风吹、尘埃、薄雾、光影闪烁、粒子漂浮等（必须符合视频Prompt氛围）
   - 特效动态：如雷光/火光/雪花等（仅当视频Prompt中明确存在）
   - 角色动态：非常轻微（披风摆动、发丝飘动、呼吸起伏），不得大幅走动或改变姿态
5) 镜头语言：严格遵循 JSON 的“视频Prompt”中的风格与镜头感。
   - 若视频Prompt未明确镜头运动：默认“极慢推镜（slow push-in）”或“轻微稳定漂移（subtle drift）”
6) 视觉风格与画质（必须做到）：
   - 电影级写实风（或按视频Prompt）
   - 4K细节，清晰对焦，真实景深，体积光，阴影层次丰富
   - 色调严格遵循视频Prompt（例如黑白单色调、压抑氛围等）

【禁止事项】
- 禁止切镜/闪回/分屏/加字幕/加文字/加水印/加logo
- 禁止新增剧情内容
- 禁止改变人物外观或场景结构
- 禁止模糊、低清、抖动过大、画面崩坏

【输出】
只输出生成的视频片段，不要输出任何解释文字。`,
          },
        ],
      },
      {
        name: '空白prompt',
        description: null,
        versions: [
          {
            version: 1,
            name: 'v1',
            variables: ['text'],
            content: '{{text}}',
          },
        ],
      },
    ];

    if (existingCount === 0) {
      for (const tpl of promptSeeds) {
        const template = await this.promptTemplateRepository.save(
          this.promptTemplateRepository.create({
            name: tpl.name,
            description: tpl.description ?? null,
          }),
        );

        for (const version of tpl.versions) {
          const versionEntity = await this.promptTemplateVersionRepository.save(
            this.promptTemplateVersionRepository.create({
              templateId: template.id,
              version: version.version ?? 1,
              name: version.name,
              content: version.content,
              variablesJson: JSON.stringify(version.variables ?? []),
            }),
          );
          versionMap.set(tpl.name, versionEntity.id);
        }
      }
      this.logger.log('Seeded prompt templates');
    }

    // Build map from existing data to support node-tool seeding
    for (const tpl of promptSeeds) {
      const foundTemplate = await this.promptTemplateRepository.findOne({ where: { name: tpl.name } });
      if (!foundTemplate) continue;
      const foundVersion = await this.promptTemplateVersionRepository.findOne({
        where: { templateId: foundTemplate.id },
        order: { version: 'DESC', id: 'DESC' },
      });
      if (foundVersion) {
        versionMap.set(tpl.name, foundVersion.id);
      }
    }

    return versionMap;
  }

  /**
   * Seed node tools (only when empty)
   */
  private async seedNodeTools(promptVersionMap: Map<string, number>) {
    const existingCount = await this.nodeToolRepository.count();
    if (existingCount > 0) return;

    const getVersion = (name: string) => {
      const id = promptVersionMap.get(name);
      if (!id) {
        this.logger.warn(`[seed] prompt version not found for ${name}, node-tool may be incomplete`);
      }
      return id ?? null;
    };

    const tools: Array<Partial<NodeTool>> = [
      {
        name: '剧本拆解自动化',
        description: '剧本-->人物，场景，道具',
        promptTemplateVersionId: getVersion('剧本拆解User Prompt') ?? undefined,
        systemPromptVersionId: getVersion('剧本拆解System Prompt') ?? undefined,
        model: 'gemini-3-flash-preview',
        imageAspectRatio: '16:9',
        maxTokens: 4000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'Novel_Text', name: 'Novel_Text', type: 'text', required: true },
        ]),
        outputsJson: JSON.stringify([
          { key: 'output_1', name: '人物，场景，道具', type: 'json', required: true },
        ]),
        enabled: true,
      },
      {
        name: 'nano banana Pro文生图',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        systemPromptVersionId: null,
        model: 'gemini-3-pro-image-preview',
        imageAspectRatio: '16:9',
        maxTokens: 1000,
        temperature: 0.7,
        modelConfigJson: JSON.stringify({ imageConfig: { aspectRatio: '16:9' } }),
        inputsJson: JSON.stringify([{ key: 'text', name: 'text', type: 'text', required: true }]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_ref', required: false }]),
        enabled: true,
      },
      {
        name: 'nano banana Pro文+图生图',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        systemPromptVersionId: null,
        model: 'gemini-3-pro-image-preview',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'text', name: 'text', type: 'text', required: true },
          { key: 'image1', name: 'image1', type: 'asset_ref', required: false },
          { key: 'image2', name: 'image2', type: 'asset_ref', required: false },
          { key: 'image3', name: 'image3', type: 'asset_ref', required: false },
          { key: 'image4', name: 'image4', type: 'asset_ref', required: false },
          { key: 'image5', name: 'image5', type: 'asset_ref', required: false },
          { key: 'image6', name: 'image6', type: 'asset_ref', required: false },
          { key: 'image7', name: 'image7', type: 'asset_ref', required: false },
          { key: 'image8', name: 'image8', type: 'asset_ref', required: false },
          { key: 'image9', name: 'image9', type: 'asset_ref', required: false },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_ref', required: false }]),
        enabled: true,
      },
      {
        name: '极梦4.5文生图',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        systemPromptVersionId: null,
        model: 'doubao-seedream-4-5-251128',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([{ key: 'text', name: 'text', type: 'text', required: true }]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_ref', required: false }]),
        enabled: true,
      },
      {
        name: '极梦4.5文+图生图',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        systemPromptVersionId: null,
        model: 'doubao-seedream-4-5-251128',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'text', name: 'text', type: 'text', required: true },
          { key: 'image1', name: 'image1', type: 'asset_ref', required: false },
          { key: 'image2', name: 'image2', type: 'asset_ref', required: false },
          { key: 'image3', name: 'image3', type: 'asset_ref', required: false },
          { key: 'image4', name: 'image4', type: 'asset_ref', required: false },
          { key: 'image5', name: 'image5', type: 'asset_ref', required: false },
          { key: 'image6', name: 'image6', type: 'asset_ref', required: false },
          { key: 'image7', name: 'image7', type: 'asset_ref', required: false },
          { key: 'image8', name: 'image8', type: 'asset_ref', required: false },
          { key: 'image9', name: 'image9', type: 'asset_ref', required: false },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_ref', required: false }]),
        enabled: true,
      },
      {
        name: '定妆照',
        promptTemplateVersionId: getVersion('定妆照') ?? undefined,
        model: 'doubao-seedream-4-5-251128',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        modelConfigJson: JSON.stringify({ size: '2K' }),
        inputsJson: JSON.stringify([
          { key: 'Input_Type', name: 'Input_Type', type: 'text', required: true },
          { key: 'Description', name: 'Description', type: 'text', required: true },
        ]),
        outputsJson: JSON.stringify([{ key: 'Image', name: 'Image', type: 'asset_ref', required: false }]),
        enabled: true,
      },
      {
        name: '分镜头关键帧',
        description: '提供人物场景道具定妆图，参考生成关键帧图片。',
        promptTemplateVersionId: getVersion('分镜头关键帧') ?? undefined,
        model: 'doubao-seedream-4-5-251128',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'Frame_Info', name: 'Frame_Info', type: 'text', required: true },
          { key: 'image1', name: 'image1', type: 'asset_ref', required: false },
          { key: 'image2', name: 'image2', type: 'asset_ref', required: false },
          { key: 'image3', name: 'image3', type: 'asset_ref', required: false },
          { key: 'image4', name: 'image4', type: 'asset_ref', required: false },
          { key: 'image5', name: 'image5', type: 'asset_ref', required: false },
          { key: 'image6', name: 'image6', type: 'asset_ref', required: false },
          { key: 'image7', name: 'image7', type: 'asset_ref', required: false },
          { key: 'image8', name: 'image8', type: 'asset_ref', required: false },
          { key: 'image9', name: 'image9', type: 'asset_ref', required: false },
          { key: 'image10', name: 'image10', type: 'asset_ref', required: false },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_ref', required: false }]),
        enabled: true,
      },
      {
        name: '关键帧转视频',
        promptTemplateVersionId: getVersion('关键帧转视频') ?? undefined,
        model: 'sora-2-pro',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'input_reference', name: '参考图', type: 'asset_file', required: true },
          { key: 'Frame_Info', name: 'Frame_Info', type: 'text', required: true },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_file', required: false }]),
        enabled: true,
      },
      {
        name: 'veo3.1文生视频',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        model: 'veo-3.1',
        imageAspectRatio: '16:9',
        maxTokens: 1000,
        temperature: 0.7,
        modelConfigJson: JSON.stringify({ seconds: 10 }),
        inputsJson: JSON.stringify([{ key: 'text', name: 'text', type: 'text', required: true }]),
        outputsJson: JSON.stringify([{ key: 'video', name: 'video', type: 'asset_file', required: false }]),
        enabled: true,
      },
      {
        name: 'veo3.1文+图生视频',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        model: 'veo-3.1',
        imageAspectRatio: '16:9',
        maxTokens: 1000,
        temperature: 0.7,
        modelConfigJson: JSON.stringify({ seconds: 10 }),
        inputsJson: JSON.stringify([
          { key: 'text', name: 'text', type: 'text', required: true },
          { key: 'input_reference', name: '参考图', type: 'asset_file', required: true },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_file', required: false }]),
        enabled: true,
      },
      {
        name: 'sora 2 Pro文+图生视频',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        model: 'sora-2-pro',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'text', name: 'text', type: 'text', required: true },
          { key: 'input_reference', name: '参考图', type: 'asset_file', required: false },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_file', required: false }]),
        enabled: true,
      },
      {
        name: 'sora 2 Pro文生视频',
        promptTemplateVersionId: getVersion('空白prompt') ?? undefined,
        model: 'sora-2-pro',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([{ key: 'text', name: 'text', type: 'text', required: true }]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'asset_file', required: false }]),
        enabled: true,
      },
      {
        name: '镜头语言转译',
        description: '剧本->分镜脚本',
        promptTemplateVersionId: getVersion('镜头语言转译User Prompt') ?? undefined,
        systemPromptVersionId: getVersion('镜头语言转译System Prompt') ?? undefined,
        model: 'gemini-3-flash-preview',
        imageAspectRatio: '16:9',
        maxTokens: 8000,
        temperature: 0.7,
        inputsJson: JSON.stringify([
          { key: 'Character_Scene_JSON', name: 'Character_Scene_JSON', type: 'text', required: true },
          { key: 'Novel_Text', name: 'Novel_Text', type: 'text', required: true },
        ]),
        outputsJson: JSON.stringify([{ key: 'output_1', name: 'output_1', type: 'json', required: false }]),
        enabled: true,
      },
    ];

    await this.nodeToolRepository.save(tools.map((tool) => this.nodeToolRepository.create(tool)));
    this.logger.log('Seeded node tools');
  }

  private async seedWorkflow() {
    const existing = await this.workflowTemplateRepository.findOne({ where: { name: 'Default Workflow' } });
    if (existing) {
      const versions = await this.workflowVersionRepository.find({ where: { templateId: existing.id } });
      const versionIds = versions.map((version) => version.id);
      if (versionIds.length) {
        const runCount = await this.workflowRunRepository.count({ where: { templateVersionId: In(versionIds) } });
        if (runCount > 0) {
          this.logger.warn('Default Workflow has existing runs, skip auto-removal');
          return;
        }
      }
      await this.workflowVersionRepository.delete({ templateId: existing.id });
      await this.workflowTemplateRepository.remove(existing);
      this.logger.log('Removed default workflow template');
      return;
    }
  }
}
