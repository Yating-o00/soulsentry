import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 批量导入地址：支持 CSV 文件 或 多行文本粘贴
 * 每行格式：名称,地址          或          名称,地址,类型(可选)
 *           只填地址也可（名称会自动用地址前 12 字）
 *
 * 解析流程：逐行调用 suggestGeofenceParams（含 Nominatim + Kimi 兜底），
 * 返回坐标后批量创建到 SavedLocation。
 */

const TYPE_KEYWORDS = [
  { value: 'home', words: ['家', 'home', '住宅', '小区'], icon: '🏠' },
  { value: 'office', words: ['公司', '办公', 'office', '园区'], icon: '🏢' },
  { value: 'gym', words: ['健身', 'gym'], icon: '💪' },
  { value: 'school', words: ['学校', '大学', 'school', '中学', '小学'], icon: '🎓' },
  { value: 'shopping', words: ['商场', '广场', '超市', 'mall'], icon: '🛍️' },
  { value: 'hospital', words: ['医院', 'hospital', '诊所'], icon: '🏥' },
  { value: 'restaurant', words: ['餐厅', '饭店', 'restaurant', '咖啡', '茶'], icon: '🍽️' }
];

const TYPE_TO_ICON = {
  home: '🏠', office: '🏢', gym: '💪', school: '🎓',
  shopping: '🛍️', hospital: '🏥', restaurant: '🍽️', other: '📍'
};

const guessType = (text) => {
  const t = (text || '').toLowerCase();
  for (const k of TYPE_KEYWORDS) {
    if (k.words.some((w) => t.includes(w))) return k.value;
  }
  return 'other';
};

// 简易 CSV 行解析（支持引号包裹的字段、逗号或制表符分隔）
const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
    } else if ((c === ',' || c === '\t') && !inQuote) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
};

const parseInput = (text) => {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const parts = parseCsvLine(line);
      // 跳过 CSV 表头
      const headerLike = /^(名称|name|title)$/i.test(parts[0] || '');
      if (headerLike) return null;

      let name = '', address = '', typeHint = '';
      if (parts.length === 1) {
        address = parts[0];
        name = address.length > 12 ? address.slice(0, 12) + '…' : address;
      } else {
        name = parts[0];
        address = parts[1] || '';
        typeHint = parts[2] || '';
      }
      if (!address) return null;
      const location_type = typeHint
        ? (TYPE_KEYWORDS.find((k) => k.value === typeHint.toLowerCase())?.value || guessType(typeHint))
        : guessType(name + ' ' + address);
      return { name, address, location_type };
    })
    .filter(Boolean);
};

export default function BatchImportDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]); // {name, address, location_type, status, lat, lng, error}
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const reset = () => {
    setText('');
    setRows([]);
    setRunning(false);
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    toast.success(`已读取 ${file.name}`);
  };

  const handleParse = () => {
    const parsed = parseInput(text);
    if (!parsed.length) {
      toast.error('未识别到任何有效行，请检查格式');
      return;
    }
    setRows(parsed.map((r) => ({ ...r, status: 'pending' })));
    toast.success(`已识别 ${parsed.length} 行`);
  };

  const resolveOne = async (row) => {
    try {
      const res = await base44.functions.invoke('suggestGeofenceParams', {
        name: row.name,
        address: row.address,
        location_type: row.location_type
      });
      const d = res?.data;
      if (!d || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') {
        return { ...row, status: 'failed', error: '无法解析坐标' };
      }
      return {
        ...row,
        status: 'resolved',
        lat: d.latitude,
        lng: d.longitude,
        radius: d.radius || 200,
        quiet_minutes: d.quiet_minutes || 30,
        resolved_address: d.resolved_address
      };
    } catch (e) {
      return { ...row, status: 'failed', error: e.message || '请求失败' };
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      setRunning(true);
      const total = rows.length;
      setProgress({ done: 0, total });

      const resolved = [];
      for (let i = 0; i < rows.length; i++) {
        // 标记当前行为 resolving
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'resolving' } : r)));
        const out = await resolveOne(rows[i]);
        resolved.push(out);
        setRows((prev) => prev.map((r, idx) => (idx === i ? out : r)));
        setProgress({ done: i + 1, total });
      }

      // 批量创建成功的
      const toCreate = resolved
        .filter((r) => r.status === 'resolved')
        .map((r) => ({
          name: r.name,
          location_type: r.location_type,
          latitude: r.lat,
          longitude: r.lng,
          radius: r.radius,
          quiet_minutes: r.quiet_minutes,
          address: r.resolved_address || r.address,
          icon: TYPE_TO_ICON[r.location_type] || '📍',
          is_active: true,
          trigger_on: 'enter'
        }));

      if (toCreate.length) {
        await base44.entities.SavedLocation.bulkCreate(toCreate);
      }
      return { created: toCreate.length, failed: resolved.length - toCreate.length };
    },
    onSuccess: ({ created, failed }) => {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ['saved-locations'] });
      if (created) toast.success(`已导入 ${created} 个地点${failed ? `，${failed} 个失败` : ''}`);
      else toast.error('全部解析失败，请检查地址');
    },
    onError: (e) => {
      setRunning(false);
      toast.error('导入失败：' + e.message);
    }
  });

  const handleClose = () => {
    if (running) return;
    reset();
    onOpenChange(false);
  };

  const successCount = rows.filter((r) => r.status === 'resolved').length;
  const failedCount = rows.filter((r) => r.status === 'failed').length;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : onOpenChange(o))}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-500" />
            批量导入地址
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 输入区 */}
          {rows.length === 0 && (
            <>
              <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 text-xs text-slate-600 leading-relaxed">
                <p className="font-medium text-slate-800 mb-1">支持格式（每行一个地点）：</p>
                <code className="block bg-white rounded px-2 py-1 mt-1 text-[11px] font-mono text-indigo-700">
                  名称,地址<br/>
                  公司,北京市朝阳区望京SOHO<br/>
                  家,上海市浦东新区世纪大道100号<br/>
                  星巴克咖啡店（只填地址也可）
                </code>
                <p className="mt-2 text-[11px] text-slate-500">
                  系统会调用 AI 地址解析自动获取经纬度，并智能识别地点类型。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileText className="w-4 h-4 mr-1.5" />
                  选择 CSV/TXT 文件
                </Button>
              </div>

              <div>
                <Label className="text-xs text-slate-500">或直接粘贴地址列表</Label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'公司,北京市朝阳区望京SOHO\n家,上海市浦东新区世纪大道100号\n星巴克咖啡店'}
                  className="mt-1 font-mono text-xs min-h-[140px]"
                />
              </div>

              <Button
                onClick={handleParse}
                disabled={!text.trim()}
                className="w-full bg-[#384877] hover:bg-[#2d3a61]"
              >
                识别地址列表
              </Button>
            </>
          )}

          {/* 预览/进度区 */}
          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-slate-600">共 <b>{rows.length}</b> 行</span>
                  {successCount > 0 && (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {successCount} 成功
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {failedCount} 失败
                    </span>
                  )}
                </div>
                {running && (
                  <span className="text-indigo-600">
                    解析中 {progress.done}/{progress.total}
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {rows.map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 text-xs"
                  >
                    <div className="w-5 flex-shrink-0 mt-0.5">
                      {r.status === 'pending' && <span className="text-slate-300">○</span>}
                      {r.status === 'resolving' && <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />}
                      {r.status === 'resolved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      {r.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span>{TYPE_TO_ICON[r.location_type]}</span>
                        <span className="font-medium text-slate-800 truncate">{r.name}</span>
                      </div>
                      <div className="text-slate-500 truncate">{r.address}</div>
                      {r.status === 'resolved' && (
                        <div className="text-[10px] font-mono text-emerald-600 mt-0.5">
                          {r.lat.toFixed(4)}, {r.lng.toFixed(4)} · 半径 {r.radius}m
                        </div>
                      )}
                      {r.status === 'failed' && (
                        <div className="text-[10px] text-red-500 mt-0.5">{r.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {rows.length === 0 ? (
            <Button variant="outline" onClick={handleClose}>取消</Button>
          ) : !running && successCount === 0 && failedCount === 0 ? (
            <>
              <Button variant="outline" onClick={() => setRows([])}>返回编辑</Button>
              <Button
                className="bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600"
                onClick={() => importMutation.mutate()}
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                开始解析并导入
              </Button>
            </>
          ) : running ? (
            <Button disabled>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              处理中...
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => { reset(); }}>再导入一批</Button>
              <Button onClick={handleClose}>完成</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}