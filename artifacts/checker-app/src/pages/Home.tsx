import { useState, useEffect } from 'react';
import { ShieldCheck, Play, Download, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CheckResult, CheckInputMode } from '@workspace/api-client-react/src/generated/api.schemas';

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-live/10 text-live border border-live/20">
        <span className="w-1.5 h-1.5 rounded-full dot-live"></span>
        LIVE
      </span>
    );
  }
  if (status === 'die') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/20">
        <span className="w-1.5 h-1.5 rounded-full dot-die"></span>
        DIE
      </span>
    );
  }
  if (status === 'deactivated') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full dot-deact"></span>
        DEACT
      </span>
    );
  }
  if (status === 'locked') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full dot-locked"></span>
        LOCKED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
      ERR
    </span>
  );
};

const PlanBadge = ({ plan }: { plan: string | null | undefined }) => {
  if (!plan || plan.toLowerCase() === 'free') {
    return <span className="text-[10px] font-medium text-muted-foreground">Free</span>;
  }
  
  const p = plan.toLowerCase();
  let colorClass = "bg-muted text-foreground border-border";
  if (p.includes('plus')) colorClass = "bg-[#00d2a0]/10 text-[#00d2a0] border-[#00d2a0]/30";
  else if (p.includes('pro')) colorClass = "bg-purple-500/10 text-purple-400 border-purple-500/30";
  else if (p.includes('team')) colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/30";
  
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
      {plan}
    </span>
  );
};

export default function Home() {
  const { toast } = useToast();
  
  const [mode, setMode] = useState<CheckInputMode>(
    () => (localStorage.getItem('checker_mode') as CheckInputMode) || "account"
  );
  const [rawText, setRawText] = useState(
    () => localStorage.getItem('checker_draft') || ""
  );
  const [concurrency, setConcurrency] = useState(3);
  const [proxyText, setProxyText] = useState(
    () => localStorage.getItem('checker_proxies') || "http://qZridLK2nxkMMhP:lgHMoBhmoPr3uWO@48.45.147.50:42887"
  );
  const [showProxy, setShowProxy] = useState(false);
  
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [stats, setStats] = useState({ total: 0, live: 0, die: 0, deactivated: 0, locked: 0, error: 0 });
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    localStorage.setItem('checker_mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('checker_draft', rawText);
  }, [rawText]);

  useEffect(() => {
    localStorage.setItem('checker_proxies', proxyText);
  }, [proxyText]);

  const lineCount = rawText ? rawText.split('\n').length : 0;

  const handleCheck = async () => {
    const textLines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (textLines.length === 0) return;
    
    setIsChecking(true);
    setResults([]);
    setStats({ total: textLines.length, live: 0, die: 0, deactivated: 0, locked: 0, error: 0 });
    setProgress({ completed: 0, total: textLines.length });

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, rawText, concurrency,
          proxies: proxyText.split('\n').map(l => l.trim()).filter(Boolean),
        })
      });
      
      if (!response.body) throw new Error("No response body from server");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        
        for (const eventBlock of events) {
          const lines = eventBlock.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (!dataStr.trim()) continue;
              
              try {
                const event = JSON.parse(dataStr);
                if (event.type === 'start') {
                  setProgress(p => ({ ...p, total: event.total }));
                  setStats(s => ({ ...s, total: event.total }));
                } else if (event.type === 'result') {
                  const res = event.data as CheckResult;
                  setResults(prev => [res, ...prev]);
                  setStats(s => ({
                    ...s,
                    [res.status]: (s[res.status as keyof typeof s] || 0) + 1
                  }));
                  setProgress(p => ({ ...p, completed: p.completed + 1 }));
                }
              } catch (e) {
                 console.error("Parse error", e);
              }
            }
          }
        }
      }
      toast({ title: "Check Complete", description: `Finished checking items.` });
    } catch (error) {
      toast({ title: "Connection Error", description: "Failed to connect to the check API.", variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const exportData = (type: 'live' | 'die' | 'all') => {
    let content = '';
    if (type === 'live') {
      const lives = results.filter(r => r.status === 'live');
      content = lives.map(r => r.input).join('\n');
    } else if (type === 'die') {
      const dies = results.filter(r => r.status === 'die' || r.status === 'locked' || r.status === 'deactivated');
      content = dies.map(r => `${r.input} | ${r.error || r.status}`).join('\n');
    } else {
      content = results.map(r => `${r.status.toUpperCase()} | ${r.input} | ${r.plan || 'Free'} | ${r.error || ''}`).join('\n');
    }
    
    if (!content) {
      toast({ title: "Nothing to export", description: "No results match this category.", variant: "destructive" });
      return;
    }
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gpt_checker_${type}_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen lg:h-screen w-full bg-background text-foreground p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 overflow-auto lg:overflow-hidden selection:bg-primary/30">
      
      {/* LEFT COLUMN */}
      <div className="flex flex-col gap-4 bg-card rounded-xl border border-border p-5 shadow-lg lg:h-full lg:overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-border/50">
          <h1 className="text-lg font-bold tracking-tight text-primary flex items-center gap-2 font-mono">
            <ShieldCheck className="w-5 h-5" />
            GPT_CHECKER
          </h1>
          <div className="flex bg-background border border-border rounded-md p-1 shadow-inner">
            <button 
              onClick={() => setMode('account')} 
              className={cn("px-3 py-1 text-xs font-semibold rounded-sm transition-all duration-200", mode === 'account' ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
            >
              Account
            </button>
            <button 
              onClick={() => setMode('session')} 
              className={cn("px-3 py-1 text-xs font-semibold rounded-sm transition-all duration-200", mode === 'session' ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
            >
              Session
            </button>
          </div>
        </div>
        
        <p className="text-[11px] font-mono text-muted-foreground bg-muted/50 p-2 rounded border border-border/50 shrink-0">
          {mode === 'account' ? 'Format: email|password|2fa_secret (2fa optional)' : 'Format: session cookie or access token (eyJ...)'}
        </p>
        
        <div className="relative flex-1 min-h-[200px] flex flex-col group">
          <textarea 
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            className="flex-1 w-full p-4 bg-background border border-border rounded-lg font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all custom-scrollbar placeholder:text-muted-foreground/50"
            placeholder="Paste credentials here, one per line..."
            spellCheck={false}
          />
          <div className="absolute bottom-3 right-3 text-[10px] font-mono text-muted-foreground bg-card/90 backdrop-blur-sm px-2 py-1 rounded border border-border shadow-sm pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </div>
        </div>
        
        <div className="flex flex-col gap-3 pt-2 shrink-0">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Threads</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                value={concurrency} 
                onChange={e => setConcurrency(parseInt(e.target.value) || 1)}
                className="w-14 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowProxy(v => !v)}
                className={cn("text-xs flex items-center gap-1 transition-colors px-2 py-1 rounded border", showProxy ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted")}
                title="Toggle proxy list"
              >
                <span className="font-mono font-bold">PROXY</span>
                {proxyText.split('\n').filter(l => l.trim()).length > 0 && (
                  <span className="bg-primary text-primary-foreground text-[9px] font-bold px-1 rounded-full">
                    {proxyText.split('\n').filter(l => l.trim()).length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => { if(confirm("Clear all text?")) setRawText(""); }}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>

          {showProxy && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Proxy List</label>
                <span className="text-[10px] text-muted-foreground/60 font-mono">http://host:port hoặc http://user:pass@host:port</span>
              </div>
              <textarea
                value={proxyText}
                onChange={e => setProxyText(e.target.value)}
                rows={4}
                placeholder={"http://1.2.3.4:8080\nhttp://user:pass@5.6.7.8:3128"}
                spellCheck={false}
                className="w-full p-2 bg-background border border-border rounded font-mono text-xs leading-relaxed resize-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all custom-scrollbar placeholder:text-muted-foreground/40"
              />
              {proxyText.trim() && (
                <p className="text-[10px] text-muted-foreground/60 px-1">
                  {proxyText.split('\n').filter(l => l.trim()).length} proxy · xoay vòng round-robin
                </p>
              )}
            </div>
          )}
          
          <button 
            onClick={handleCheck}
            disabled={isChecking || !rawText.trim()}
            className="w-full py-3 bg-primary text-primary-foreground font-bold text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
          >
            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isChecking ? 'CHECKING...' : 'START CHECK'}
          </button>
        </div>
        
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden shrink-0 mt-1">
          <div 
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="flex flex-col gap-4 h-full overflow-hidden">
        
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 shrink-0">
          <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-muted rounded-bl-full opacity-20 -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
            <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">TOTAL</span>
            <span className="text-4xl font-black font-mono mt-2">{stats.total}</span>
          </div>
          <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-live rounded-bl-full opacity-10 -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
            <div className="absolute inset-0 bg-live/5 pointer-events-none"></div>
            <span className="text-live text-xs font-bold tracking-widest uppercase relative z-10">LIVE</span>
            <span className="text-4xl font-black font-mono text-live mt-2 relative z-10">{stats.live}</span>
          </div>
          <div className="bg-card border border-border p-5 rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-destructive rounded-bl-full opacity-10 -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
            <div className="absolute inset-0 bg-destructive/5 pointer-events-none"></div>
            <span className="text-destructive text-xs font-bold tracking-widest uppercase relative z-10">DIE</span>
            <span className="text-4xl font-black font-mono text-destructive mt-2 relative z-10">{stats.die + stats.deactivated + stats.locked}</span>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-card border border-border rounded-xl flex-1 flex flex-col shadow-sm overflow-hidden relative">
          <div className="px-5 py-3 border-b border-border bg-muted/30 grid grid-cols-[3rem_5.5rem_1fr_4.5rem_1fr] gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">
            <div>#</div>
            <div>STATUS</div>
            <div>INPUT / EMAIL</div>
            <div>PLAN</div>
            <div>DETAIL / ERROR</div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {results.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 text-sm font-mono gap-3">
                <ShieldCheck className="w-12 h-12 opacity-20" />
                No results yet. Awaiting input.
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="fade-in px-3 py-2.5 rounded-lg hover:bg-muted/50 grid grid-cols-[3rem_5.5rem_1fr_4.5rem_1fr] gap-4 text-xs items-center border border-transparent hover:border-border transition-all">
                    <div className="text-muted-foreground/50 font-mono text-[10px]">{r.index || results.length - i}</div>
                    <div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="font-mono text-[11px] truncate text-foreground/80 selection:bg-primary/30" title={r.email || r.input || ''}>
                      {r.email || r.input}
                    </div>
                    <div>
                      <PlanBadge plan={r.plan} />
                    </div>
                    <div className="text-muted-foreground text-[11px] truncate font-mono" title={r.error || ''}>
                      {r.error || '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Export Row */}
        <div className="bg-card border border-border p-3 px-4 rounded-xl flex items-center justify-between shrink-0 shadow-sm">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Export Results</span>
          <div className="flex gap-2">
            <button onClick={() => exportData('live')} className="px-3 py-1.5 bg-live/10 text-live text-xs font-bold uppercase tracking-wider rounded-md hover:bg-live/20 transition-colors flex items-center gap-1.5 border border-live/10">
              <Download className="w-3.5 h-3.5" /> LIVE
            </button>
            <button onClick={() => exportData('die')} className="px-3 py-1.5 bg-destructive/10 text-destructive text-xs font-bold uppercase tracking-wider rounded-md hover:bg-destructive/20 transition-colors flex items-center gap-1.5 border border-destructive/10">
              <Download className="w-3.5 h-3.5" /> DIE
            </button>
            <button onClick={() => exportData('all')} className="px-3 py-1.5 bg-muted text-foreground text-xs font-bold uppercase tracking-wider rounded-md hover:bg-muted/80 transition-colors flex items-center gap-1.5 border border-border">
              <Download className="w-3.5 h-3.5" /> ALL
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
