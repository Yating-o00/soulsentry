import crypto from "node:crypto";

function getSmsConfig() {
  const accessKeyId =
    process.env.SMS_ACCESS_KEY_ID ||
    process.env.ALIYUN_SMS_ACCESS_KEY_ID ||
    process.env.ALIYUN_ACCESS_KEY_ID;

  const accessKeySecret =
    process.env.SMS_ACCESS_KEY_SECRET ||
    process.env.ALIYUN_SMS_ACCESS_KEY_SECRET ||
    process.env.ALIYUN_ACCESS_KEY_SECRET;

  const signName =
    process.env.SMS_SIGN_NAME || process.env.ALIYUN_SMS_SIGN_NAME;

  const templateCode =
    process.env.SMS_TEMPLATE_CODE ||
    process.env.ALIYUN_SMS_TEMPLATE_CODE ||
    process.env.ALIYUN_SMS_TEMPLATE_LOGIN;

  const region =
    process.env.ALIYUN_SMS_REGION ||
    process.env.ALIYUN_SMS_REGION_ID ||
    "cn-hangzhou";

  return { accessKeyId, accessKeySecret, signName, templateCode, region };
}

function percentEncode(value) {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function sign(params, accessKeySecret) {
  const canonicalQueryString = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalQueryString)}`;
  const key = `${accessKeySecret}&`;
  return crypto.createHmac("sha1", key).update(stringToSign).digest("base64");
}

function generateUuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export async function sendVerificationSms(phone, code, _purpose) {
  const { accessKeyId, accessKeySecret, signName, templateCode, region } = getSmsConfig();

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    console.warn("[sms] 短信配置不完整，跳过真实发送", { phone, signName, templateCode });
    return { mocked: true, phone, code };
  }

  const templateParam = JSON.stringify({ code });

  const params = {
    AccessKeyId: accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    SignName: signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: generateUuid(),
    SignatureVersion: "1.0",
    TemplateCode: templateCode,
    TemplateParam: templateParam,
    Timestamp: new Date().toISOString(),
    Version: "2017-05-25"
  };

  params.Signature = sign(params, accessKeySecret);

  const query = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const url = `https://dysmsapi.aliyuncs.com/?${query}`;

  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (data?.Code !== "OK") {
    const error = new Error(data?.Message || `短信发送失败: ${text}`);
    error.code = data?.Code || "SMS_SEND_FAILED";
    throw error;
  }

  return { success: true, phone, code, requestId: data.RequestId };
}
