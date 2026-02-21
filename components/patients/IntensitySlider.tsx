import React from 'react';

interface IntensitySliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}

export const IntensitySlider: React.FC<IntensitySliderProps> = ({
    label,
    value,
    onChange,
    min = 1,
    max = 10,
    step = 1,
}) => {
    return (
        <div className="flex flex-col gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="flex justify-between items-end">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {label}
                </label>
                <span className="text-xl font-black text-teal-400 tabular-nums">
                    {value < 10 ? `0${value}` : value}
                </span>
            </div>

            <div className="relative h-6 flex items-center">
                {/* Track Background */}
                <div className="absolute inset-0 h-1.5 bg-slate-800 rounded-full my-auto border border-white/5" />

                {/* Track Active */}
                <div
                    className="absolute inset-0 h-1.5 bg-gradient-to-r from-teal-600 to-teal-400 rounded-full my-auto shadow-[0_0_15px_rgba(45,212,191,0.3)]"
                    style={{ width: `${((value - min) / (max - min)) * 100}%` }}
                />

                {/* Input Range */}
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />

                {/* Custom Thumb (Visual only) */}
                <div
                    className="absolute w-5 h-5 bg-white rounded-full shadow-xl border-2 border-teal-500 pointer-events-none transform transition-transform duration-150"
                    style={{
                        left: `calc(${((value - min) / (max - min)) * 100}% - 10px)`
                    }}
                />
            </div>

            <div className="flex justify-between px-1">
                <span className="text-[10px] text-slate-600 font-bold uppercase">Natural</span>
                <span className="text-[10px] text-slate-600 font-bold uppercase">Hollywood</span>
            </div>
        </div>
    );
};
