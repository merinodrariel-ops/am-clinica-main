export default function WorkflowsLoading() {
    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
            {/* Header Skeleton */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="space-y-2">
                    <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-4 w-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"></div>
                </div>
                <div className="h-10 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Skeleton */}
                <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4"></div>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"></div>
                    ))}
                </div>

                {/* Board Skeleton */}
                <div className="flex-1 bg-gray-100/50 dark:bg-gray-900/50 p-6 overflow-hidden">
                    <div className="flex gap-4 h-full overflow-x-auto pb-4">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="min-w-[280px] w-80 h-full flex flex-col gap-3">
                                <div className="h-12 w-full bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"></div>
                                <div className="flex-1 bg-gray-200/50 dark:bg-gray-800/50 rounded-lg animate-pulse"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
