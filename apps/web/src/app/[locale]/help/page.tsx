import { AppShell } from "@/components/app-shell";
import { SiteFeedbackPanel } from "@/components/site-feedback";

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isZh = locale === "zh";
  const sections = isZh ? [
    ["使用范围", "ForkFit 目前处于小规模公测。AI 菜单可能有遗漏，做菜前请核对食材、份量和步骤。它不提供医疗建议，也不能判断包装配料或厨房交叉污染；严重过敏或特殊医疗饮食请勿仅依赖生成结果。"],
    ["保存哪些信息", "服务保存账号、密码哈希、你填写的资料与偏好、菜单、对话及历史版本。发布的帖子、图片、评论和公开个人资料可被其他访客看到。请不要上传证件、联系方式或他人的私人信息。"],
    ["AI 如何使用输入", "规划、调整和口味提取会把相关需求、菜谱及必要的偏好或对话上下文发送给配置的模型供应商。当前使用百炼兼容接口接入模型；不要在需求中填写姓名、联系方式或完整病历。模型供应商的数据处理规则由其自行提供。"],
    ["运行记录", "服务保留错误与运行记录用于排错，并使用 LangSmith 运行追踪。追踪可能包含流程输入输出，例如菜谱、偏好和对话上下文，因此也会由该第三方服务处理。请只提供完成菜单规划所需的信息。"],
    ["登录与本地存储", "Cookie 用于登录和请求保护；浏览器本地存储用于保留草稿、选菜和采购勾选。共用设备上请退出登录，并按需清除本站数据。退出登录不等于删除服务器上的账号或菜单。"],
    ["保存与删除", "菜单和对话历史保存在服务器，用于恢复与撤销；数据库有定期备份，删除不会立即清除既有备份。目前不支持自助注销或一键导出，相关申请需由维护者核实身份后人工处理。"],
  ] : [
    ["Public beta", "ForkFit is a small public beta. AI menus may contain errors; check ingredients, quantities and instructions before cooking. It is not medical advice and cannot assess packaging or cross-contact. Do not rely on generated recipes alone for severe allergies or medical diets."],
    ["Stored information", "We store accounts, password hashes, profiles, preferences, plans, conversations and versions. Published posts, images, comments and public profiles are visible to other visitors. Do not upload identification, contact details or another person's private information."],
    ["AI processing", "Planning, editing and preference extraction send relevant requests, recipes and necessary preference or conversation context to the configured model provider, currently through the Bailian-compatible API. Avoid names, contact details and full medical records. The provider supplies its own data-processing terms."],
    ["Operational records", "The service retains error and execution records and uses LangSmith tracing for diagnosis. Traces may include workflow inputs and outputs such as recipes, preferences and conversation context, which this third-party service also processes. Only provide information needed for meal planning."],
    ["Cookies and local storage", "Cookies support login and request protection. Local storage retains drafts, recipe selections and shopping checkmarks. On shared devices, log out and clear site data as needed. Logging out does not delete your server account or menus."],
    ["Retention and deletion", "Plans and conversation versions are stored for recovery and undo. Database backups are made regularly; deletion does not immediately remove existing backups. Self-service account deletion and export are not available. Requests require manual identity verification by the maintainer."],
  ];

  return <AppShell>
    <article className="site-container py-8 md:py-12">
      <div className="mx-auto max-w-[720px] space-y-8">
        <header><h1 className="page-heading">{isZh ? "公测使用与隐私说明" : "Beta use and privacy"}</h1><p className="mt-3 text-sm text-[var(--muted-text)]">{isZh ? "更新于 2026 年 10 月 16 日" : "Updated October 16, 2026"}</p></header>
        {sections.map(([title, body]) => <section key={title}><h2 className="section-heading">{title}</h2><p className="mt-3 leading-7">{body}</p></section>)}
        <section id="feedback">
          <h2 className="section-heading">{isZh ? "问题反馈与数据申请" : "Feedback and data requests"}</h2>
          <p className="mt-3 leading-7">{isZh ? "反馈时提供出错页面、时间和操作步骤即可。截图请遮住个人信息；不要公开密码、完整对话或健康信息。" : "Include the page, time and steps to reproduce. Redact personal details in screenshots; never publish passwords, full conversations or health information."}</p>
          <p className="mt-3 leading-7">{isZh ? "反馈内容和处理回复保存在站内，仅你和管理员可见。数据导出或删除申请也可在这里提交。" : "Feedback and replies are stored privately, visible only to you and administrators. You can also request data export or deletion here."}</p>
          <SiteFeedbackPanel />
        </section>
      </div>
    </article>
  </AppShell>;
}
