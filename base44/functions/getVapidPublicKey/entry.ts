/**
 * 返回 VAPID 公钥，前端用它向浏览器 Push 服务订阅。
 * 若未配置 VAPID_PUBLIC_KEY 环境变量，则返回 null —— 客户端会回退到仅本地通知模式。
 */
Deno.serve(() => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || null;
  return Response.json({ publicKey });
});