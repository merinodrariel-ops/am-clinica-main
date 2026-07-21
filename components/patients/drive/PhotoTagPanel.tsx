'use client';

import { useMemo, useState } from 'react';
import { X, Check, Tag, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { PHOTO_TAG_TAXONOMY, type PhotoTagCategory } from '@/lib/photo-tag-taxonomy';
import { getTagLabel } from '@/lib/photo-tag-taxonomy';
import { inferPhotoTagFromDescription } from '@/lib/photo-tag-inference';
import { savePhotoTagAction, removePhotoTagAction, type PhotoTag } from '@/app/actions/photo-tags';

interface Props {
    file: DriveFile;
    patientId: string;
    currentTag?: PhotoTag | null;
    onClose: () => void;
    onTagSaved: (tag: PhotoTag | null) => void;
}

export default function PhotoTagPanel({ file, patientId, currentTag, onClose, onTagSaved }: Props) {
    const [selectedCategory, setSelectedCategory] = useState<PhotoTagCategory | null>(
        (currentTag?.category as PhotoTagCategory) ?? null
    );
    const [selectedSub, setSelectedSub] = useState<string | null>(currentTag?.subcategory ?? null);
    const [description, setDescription] = useState(currentTag?.description ?? '');
    const [saving, setSaving] = useState(false);

    const inferredTag = useMemo(() => inferPhotoTagFromDescription(description), [description]);

    async function handleSave() {
        if (!selectedCategory) return;
        setSaving(true);
        const result = await savePhotoTagAction(file.id, patientId, selectedCategory, selectedSub, description);
        setSaving(false);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success('Tag guardado');
        onTagSaved({ file_id: file.id, category: selectedCategory, subcategory: selectedSub, description: description.trim() || null });
        onClose();
    }

    async function handleRemove() {
        setSaving(true);
        const result = await removePhotoTagAction(file.id);
        setSaving(false);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success('Tag eliminado');
        onTagSaved(null);
        onClose();
    }

    // Reset subcategory when category changes
    function selectCategory(key: PhotoTagCategory) {
        if (key === selectedCategory) return;
        setSelectedCategory(key);
        setSelectedSub(null);
    }

    function handleDescriptionChange(value: string) {
        setDescription(value);
        const nextTag = inferPhotoTagFromDescription(value);
        if (!nextTag) return;
        setSelectedCategory(nextTag.category);
        setSelectedSub(nextTag.subcategory);
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-white/10 w-64 shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                    <Tag size={14} className="text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-white truncate">
                        Describir foto
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* File name */}
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/10">
                <p className="text-xs text-gray-500 dark:text-white/40 truncate" title={file.name}>
                    {file.name}
                </p>
            </div>

            {/* Description-driven tagging */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/70 dark:bg-indigo-500/10 p-3 space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                        <Wand2 size={13} />
                        Descripción clínica
                    </label>
                    <textarea
                        value={description}
                        onChange={(event) => handleDescriptionChange(event.target.value)}
                        placeholder="Ej: foto intraoral oclusal superior, sonrisa frontal, perfil derecho de labios..."
                        rows={5}
                        className="w-full resize-none rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-400 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-white/35"
                    />
                    <div className="min-h-5 text-xs">
                        {inferredTag ? (
                            <span className="text-indigo-700 dark:text-indigo-200">
                                Interpretado como: <strong>{getTagLabel(inferredTag.category, inferredTag.subcategory)}</strong>
                            </span>
                        ) : (
                            <span className="text-gray-500 dark:text-white/45">
                                Escribí una descripción y se completa el tag.
                            </span>
                        )}
                    </div>
                </div>

                {PHOTO_TAG_TAXONOMY.map(cat => (
                    <div key={cat.key}>
                        {/* Category button */}
                        <button
                            onClick={() => selectCategory(cat.key)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                                selectedCategory === cat.key
                                    ? `${cat.bgColor} ${cat.color} border-current/30`
                                    : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-gray-300 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-white/5'
                            }`}
                        >
                            {cat.label}
                            {selectedCategory === cat.key && <Check size={13} />}
                        </button>

                        {/* Subcategories */}
                        {selectedCategory === cat.key && (
                            <div className="mt-1.5 pl-2 space-y-1">
                                {cat.subcategories.map(sub => (
                                    <button
                                        key={sub.key}
                                        onClick={() => setSelectedSub(sub.key === selectedSub ? null : sub.key)}
                                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${
                                            selectedSub === sub.key
                                                ? `${cat.bgColor} ${cat.color} font-semibold`
                                                : 'text-gray-500 dark:text-white/50 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-white/70'
                                        }`}
                                    >
                                        {selectedSub === sub.key && '✓ '}
                                        {sub.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-gray-100 dark:border-white/10 space-y-2">
                <button
                    onClick={handleSave}
                    disabled={!selectedCategory || saving}
                    className="w-full py-2 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {saving ? 'Guardando…' : 'Guardar descripción'}
                </button>
                {currentTag && (
                    <button
                        onClick={handleRemove}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                    >
                        <Trash2 size={12} /> Quitar tag
                    </button>
                )}
            </div>
        </div>
    );
}
