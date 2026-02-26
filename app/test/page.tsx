'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalLog = console.log;

        const addLog = (type: string, ...args: any[]) => {
            const message = `[${type}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
            setLogs(prev => [...prev, message]);
        };

        console.log = (...args) => { originalLog(...args); addLog('LOG', ...args); };
        console.warn = (...args) => { originalWarn(...args); addLog('WARN', ...args); };
        console.error = (...args) => { originalError(...args); addLog('ERROR', ...args); };

        window.onerror = (message, source, lineno, colno, error) => {
            addLog('WINDOW_ERROR', { message, source, lineno, colno, error });
        };

        window.onunhandledrejection = (event) => {
            addLog('PROMISE_REJECTION', event.reason);
        };

        return () => {
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
        };
    }, []);

    return (
        <div className="p-10 font-mono text-xs">
            <h1 className="text-xl font-bold mb-4">Debug Console</h1>
            <div className="bg-black text-green-400 p-4 rounded h-[80vh] overflow-y-auto">
                {logs.length === 0 ? "Waiting for logs..." : logs.map((log, i) => (
                    <div key={i} className="mb-1 border-b border-white/10 pb-1">{log}</div>
                ))}
            </div>
        </div>
    );
}
