import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@soulsentry.local";
  const passwordHash = await bcrypt.hash("demo123456", 10);

  const user = await prisma.user.upsert({
    where: { email },
    // 每次运行都重置密码与显示名：服务器上可能已有历史创建的同名账号（密码未知）
    update: { passwordHash, displayName: "SoulSentry Demo" },
    create: {
      email,
      passwordHash,
      displayName: "SoulSentry Demo",
      subscriptionPlan: "free",
      aiCredits: 200,
      preferences: {
        create: {
          locale: "zh-CN",
          timezone: "Asia/Shanghai"
        }
      },
      creditTxs: {
        create: {
          type: "GIFT",
          amount: 200,
          balanceAfter: 200,
          description: "初始化演示点数"
        }
      }
    }
  });

  console.log(`Seeded demo user: ${user.email}`);

  // ---------- 演示数据（每次运行先清后建，保持新鲜） ----------
  await prisma.task.deleteMany({ where: { userId: user.id } });
  await prisma.note.deleteMany({ where: { userId: user.id } });

  const now = new Date();
  const at = (d, h, m = 0) => {
    const t = new Date(now);
    t.setDate(t.getDate() + d);
    t.setHours(h, m, 0, 0);
    return t;
  };
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);

  await prisma.task.createMany({
    data: [
      { userId: user.id, title: "给张总回一封项目进展邮件", status: "TODO", priority: "high", category: "work", dueAt: at(0, 17), reminderTime: at(0, 16, 30), tags: ["演示"], metadata: { demo: true } },
      { userId: user.id, title: "傍晚散步 20 分钟，听听风", status: "TODO", priority: "medium", category: "health", dueAt: at(0, 19), tags: ["演示"], metadata: { demo: true } },
      { userId: user.id, title: "读《心流》第 3 章并摘一句最有共鸣的话", status: "TODO", priority: "low", category: "study", dueAt: at(1, 9), tags: ["演示"], metadata: { demo: true } },
      { userId: user.id, title: "给妈妈打个电话", status: "TODO", priority: "medium", category: "family", dueAt: at(1, 20), tags: ["演示"], metadata: { demo: true } },
      { userId: user.id, title: "整理本周心签，挑出一句做成分享卡", status: "TODO", priority: "low", category: "personal", dueAt: at(2, 15), tags: ["演示"], metadata: { demo: true } },
      { userId: user.id, title: "晨间冥想 10 分钟", status: "DONE", priority: "medium", category: "health", completedAt: at(0, 8), tags: ["演示"], metadata: { demo: true } }
    ]
  });

  const ai = (over) => ({
    analyzed_at: now.toISOString(),
    source: "demo_seed",
    ...over
  });
  await prisma.note.createMany({
    data: [
      {
        userId: user.id,
        title: "",
        content: "<p>今天有点累，但说不上为什么，心里闷闷的。</p>",
        plainText: "今天有点累，但说不上为什么，心里闷闷的。",
        sourceType: "emotion",
        aiStatus: "completed",
        color: "pink",
        tags: ["情绪", "演示"],
        metadata: {
          demo: true,
          ai_analysis: ai({
            note_type: "emotion",
            category: "情绪",
            is_emotional: true,
            response_tag: "感性回应",
            response_persona: "comforter",
            response_title: "抱抱你",
            emotional_response: "辛苦了。累却说不清楚原因的时候，往往不是你太脆弱，而是你撑了太久。今晚早点休息，把没做完的事先交给明天的自己——你已经做得很好了。",
            summary: "用户感到莫名的疲惫和闷闷的情绪",
            key_points: ["疲惫", "情绪低落"]
          })
        },
        createdAt: hoursAgo(3)
      },
      {
        userId: user.id,
        title: "注意力碎片化的机制",
        content: "<p>想了解一下注意力碎片化是怎么回事，为什么刷手机停不下来。</p>",
        plainText: "想了解一下注意力碎片化是怎么回事，为什么刷手机停不下来。",
        sourceType: "material",
        aiStatus: "completed",
        color: "blue",
        tags: ["资料", "专注力", "演示"],
        metadata: {
          demo: true,
          ai_analysis: ai({
            note_type: "material",
            category: "资料",
            is_emotional: false,
            response_tag: "理性补充",
            response_persona: "mentor",
            response_title: "知识补充",
            emotional_response: "注意力碎片化与「可变比率奖励」有关：不确定下一条内容是否有趣，会让多巴胺持续处于预期状态。可拓展：注意力残留（Attention Residue）研究——任务切换后大脑需要 15-20 分钟才能完全投入新任务。",
            summary: "用户希望了解注意力碎片化的成因",
            key_points: ["可变比率奖励", "多巴胺预期", "注意力残留"],
            related_topics: ["心流理论", "数字极简主义"]
          })
        },
        createdAt: hoursAgo(26)
      },
      {
        userId: user.id,
        title: "",
        content: "<p>如果给一年后的自己写一句话，我会写：谢谢你没放弃。</p>",
        plainText: "如果给一年后的自己写一句话，我会写：谢谢你没放弃。",
        sourceType: "inspiration",
        aiStatus: "completed",
        color: "purple",
        tags: ["灵感", "演示"],
        metadata: {
          demo: true,
          ai_analysis: ai({
            note_type: "inspiration",
            category: "灵感",
            is_emotional: true,
            response_tag: "感性回应",
            response_persona: "poet",
            response_title: "致一年后的你",
            emotional_response: "这句话值得被收进时间里。一年后的你看到它时，会想起此刻认真生活的自己。要不要把它设成一个一年后的约定？",
            summary: "一句写给未来自己的话",
            key_points: ["自我对话"]
          })
        },
        createdAt: hoursAgo(50)
      },
      {
        userId: user.id,
        title: "WiFi 密码备忘",
        content: "<p>家里路由器管理后台地址 192.168.1.1，管理员密码贴在冰箱上。</p>",
        plainText: "家里路由器管理后台地址 192.168.1.1，管理员密码贴在冰箱上。",
        sourceType: "memo",
        aiStatus: "completed",
        color: "yellow",
        tags: ["备忘", "演示"],
        metadata: {
          demo: true,
          ai_analysis: ai({
            note_type: "memo",
            category: "备忘",
            is_emotional: false,
            response_tag: "收录",
            response_title: "已收录",
            emotional_response: "已帮你记下。涉及密码类的信息建议存入保险柜更安全。",
            summary: "路由器后台信息备忘"
          })
        },
        createdAt: hoursAgo(70)
      }
    ]
  });

  const taskCount = await prisma.task.count({ where: { userId: user.id } });
  const noteCount = await prisma.note.count({ where: { userId: user.id } });
  console.log(`Seeded demo content: ${taskCount} tasks, ${noteCount} notes`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
