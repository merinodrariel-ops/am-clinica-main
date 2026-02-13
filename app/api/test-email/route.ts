import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/nodemailer';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to') || process.env.NEXT_PUBLIC_OWNER_EMAIL || '';

    try {
        const result = await sendEmail({
            to,
            subject: '🧪 Prueba de Email - AM Clínica',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                    <div style="background: #000; color: #fff; padding: 20px; text-align: center;">
                        <h1 style="margin: 0;">AM Clínica</h1>
                    </div>
                    <div style="padding: 30px; background: #fff; border: 1px solid #eee;">
                        <h2 style="color: #333;">¡El sistema de emails funciona! 🎉</h2>
                        <p style="color: #555; line-height: 1.6;">
                            Este es un correo de prueba enviado desde AM Clínica usando Gmail + Nodemailer.
                        </p>
                        <p style="color: #999; font-size: 14px; margin-top: 30px;">
                            Fecha: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
                        </p>
                    </div>
                </div>
            `
        });

        if (result.success) {
            return NextResponse.json({
                success: true,
                message: `Email enviado exitosamente a ${to}`,
                messageId: result.messageId
            });
        } else {
            return NextResponse.json({
                success: false,
                error: String(result.error)
            }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
