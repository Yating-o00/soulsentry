import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// 高德地图关键字搜索地点（返回 WGS 近似坐标，用于地理围栏）
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { keyword, city } = await req.json().catch(() => ({}));
    if (!keyword) return Response.json({ error: '请输入地点关键词' }, { status: 400 });
    const key = Deno.env.get('AMAP_KEY');
    if (!key) return Response.json({ error: '尚未配置高德地图 Key' }, { status: 400 });

    const url = `https://restapi.amap.com/v3/place/text?key=${key}&keywords=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city || '')}&offset=8`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json();
    if (data.status !== '1') return Response.json({ error: data.info || '高德搜索失败' }, { status: 502 });

    // GCJ-02 → WGS-84 近似转换，保证与浏览器定位一致
    const toWgs = (lng, lat) => {
      const a = 6378245.0, ee = 0.00669342162296594323, PI = Math.PI;
      const tLat = (x, y) => -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)) + (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3 + (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3 + (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
      const tLng = (x, y) => 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)) + (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3 + (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3 + (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
      let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
      const rad = lat / 180 * PI; let magic = 1 - ee * Math.sin(rad) ** 2; const sq = Math.sqrt(magic);
      dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sq) * PI);
      dLng = (dLng * 180) / (a / sq * Math.cos(rad) * PI);
      return { longitude: lng - dLng, latitude: lat - dLat };
    };

    const places = (data.pois || []).map((p) => {
      const [lng, lat] = String(p.location).split(',').map(Number);
      return { name: p.name, address: [p.cityname, p.adname, typeof p.address === 'string' ? p.address : ''].join(''), ...toWgs(lng, lat) };
    });
    return Response.json({ places });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});