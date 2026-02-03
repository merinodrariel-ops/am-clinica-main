
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function NoAccessPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-100 dark:border-gray-700">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Acceso Denegado
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                    No tienes permisos suficientes para acceder a esta sección. Si crees que es un error, contacta al administrador.
                </p>
                <div className="space-y-3">
                    <Link
                        href="/dashboard"
                        className="block w-full py-2.5 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium hover:opacity-90 transition-opacity"
                    >
                        Volver al Inicio
                    </Link>
                    <Link
                        href="/login"
                        className="block w-full py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        Iniciar Sesión con otra cuenta
                    </Link>
                </div>
            </div>
        </div>
    );
}
