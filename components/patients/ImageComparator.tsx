import React, { useState, useRef } from 'react';

interface ImageComparatorProps {
    beforeImage: string;
    afterImage: string;
    orientation?: 'horizontal' | 'vertical';
}

export const ImageComparator: React.FC<ImageComparatorProps> = ({
    beforeImage,
    afterImage,
    orientation = 'horizontal'
}) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const imageContainerRef = useRef<HTMLDivElement>(null);

    const handleMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement> | MouseEvent | TouchEvent) => {
        if (!imageContainerRef.current) return;
        const rect = imageContainerRef.current.getBoundingClientRect();

        if (orientation === 'horizontal') {
            const clientX = 'touches' in e
                ? (e as TouchEvent).touches[0]?.clientX || (e as any).changedTouches?.[0]?.clientX
                : (e as MouseEvent).clientX;

            if (clientX === undefined) return;

            const x = clientX - rect.left;
            const percentage = (x / rect.width) * 100;
            setSliderPosition(Math.max(0, Math.min(100, percentage)));
        } else {
            const clientY = 'touches' in e
                ? (e as TouchEvent).touches[0]?.clientY || (e as any).changedTouches?.[0]?.clientY
                : (e as MouseEvent).clientY;

            if (clientY === undefined) return;

            const y = clientY - rect.top;
            const percentage = (y / rect.height) * 100;
            setSliderPosition(Math.max(0, Math.min(100, percentage)));
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const onMouseMove = (moveEvent: MouseEvent) => handleMove(moveEvent);
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        const onTouchMove = (moveEvent: TouchEvent) => handleMove(moveEvent);
        const onTouchEnd = () => {
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove);
        window.addEventListener('touchend', onTouchEnd);
    };

    const isVertical = orientation === 'vertical';

    return (
        <div
            ref={imageContainerRef}
            className={`relative w-full max-w-2xl mx-auto aspect-square rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl select-none ${isVertical ? 'cursor-ns-resize' : 'cursor-ew-resize'} bg-slate-900`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            {/* Before Image */}
            <img
                src={beforeImage}
                alt="Before"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                draggable="false"
            />

            {/* After Image (clipped) */}
            <div
                className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
                style={{
                    clipPath: isVertical
                        ? `inset(0 0 ${100 - sliderPosition}% 0)`
                        : `inset(0 ${100 - sliderPosition}% 0 0)`
                }}
            >
                <img
                    src={afterImage}
                    alt="After"
                    className="w-full h-full object-cover pointer-events-none"
                    draggable="false"
                />
            </div>

            {/* Slider Handle Line */}
            <div
                className={`absolute bg-white/30 backdrop-blur-sm pointer-events-none ${isVertical ? 'left-0 right-0 h-0.5' : 'top-0 bottom-0 w-0.5'}`}
                style={isVertical
                    ? { top: `calc(${sliderPosition}% - 1px)` }
                    : { left: `calc(${sliderPosition}% - 1px)` }
                }
            >
                {/* Slider Handle Circle */}
                <div className={`absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white/20 shadow-2xl flex items-center justify-center backdrop-blur-xl border border-white/40 group transition-transform duration-200 active:scale-95`}>
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-slate-900 ${isVertical ? 'rotate-0' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Badges */}
            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Antes</span>
            </div>
            <div className="absolute top-4 right-4 bg-teal-500/20 backdrop-blur-md px-3 py-1 rounded-full border border-teal-500/30 pointer-events-none">
                <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">Después</span>
            </div>
        </div>
    );
};
