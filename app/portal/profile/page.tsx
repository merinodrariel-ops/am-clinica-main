import { getCurrentWorkerProfile, upsertWorkerProfile } from '@/app/actions/worker-portal';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { User, Save, Upload, Camera } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function WorkerProfilePage() {
    const worker = await getCurrentWorkerProfile();

    // If no worker profile, we show creation form (empty state)
    // In a real app, this might start with just the Auth User info pre-filled

    async function saveProfile(formData: FormData) {
        'use server';

        const data = {
            full_name: formData.get('full_name') as string,
            specialty: formData.get('specialty') as string,
            // role, payment_model, etc. should ideally be admin-only fields or read-only here
            // For now, allowing edits to basic info
        };

        // Handle photo upload logic here (separate action usually needed for storage)
        // const photo = formData.get('photo'); 

        // We need the ID if it exists, or create new linked to auth user
        if (worker) {
            await upsertWorkerProfile({ ...data, id: worker.id });
        } else {
            // Create new logic with Auth User ID would go here
            // await createNewWorkerProfile(data);
        }

        redirect('/portal/profile');
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Your Profile</h1>
                <p className="text-slate-400 mt-1">Manage your personal information and public profile card.</p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm">
                <form action={saveProfile} className="space-y-8">

                    {/* Photo Area */}
                    <div className="flex items-center gap-8">
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center border-4 border-slate-900 shadow-xl overflow-hidden">
                                {worker?.photo_url ? (
                                    <img src={worker.photo_url} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={48} className="text-slate-500" />
                                )}
                            </div>
                            <button type="button" className="absolute bottom-0 right-0 p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-500 transition-colors shadow-lg border border-slate-900">
                                <Camera size={16} />
                            </button>
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-medium text-white">Profile Photo</h3>
                            <p className="text-sm text-slate-500 mb-4">Upload a professional photo for the clinic directory.</p>
                            <div className="flex gap-3">
                                <Button type="button" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                                    Change Photo
                                </Button>
                                <Button type="button" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-900/10">
                                    Remove
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-800/50">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Full Name</label>
                            <Input
                                name="full_name"
                                defaultValue={worker?.full_name || ''}
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:ring-indigo-500/50"
                                placeholder="e.g. Dr. Sarah Smith"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Specialty / Title</label>
                            <Input
                                name="specialty"
                                defaultValue={worker?.specialty || ''}
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:ring-indigo-500/50"
                                placeholder="e.g. Orthodontist"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Role (System)</label>
                            <div className="px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-slate-500 text-sm cursor-not-allowed">
                                {worker?.role || 'Not Assigned'}
                            </div>
                            <p className="text-xs text-slate-600">Contact admin to change role or permissions.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">Payment Model</label>
                            <div className="px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-slate-500 text-sm cursor-not-allowed capitalize">
                                {worker?.payment_model || 'Standard'}
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-800/50 flex justify-end">
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
                            <Save size={18} />
                            Save Changes
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
