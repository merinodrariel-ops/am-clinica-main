import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import * as React from "react";

interface PremiumWelcomeEmailProps {
  patientName: string;
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://amesteticadental.com";

export const PremiumWelcomeEmail = ({
  patientName = "Ariel",
}: PremiumWelcomeEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>¡Bienvenido a la nueva experiencia de AM Clínica! ✨</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: "#4F46E5",
                accent: "#06B6D4",
                slate: {
                  900: "#0F172A",
                  500: "#64748B",
                  50: "#F8FAFC",
                },
              },
            },
          },
        }}
      >
        <Body className="bg-slate-50 my-auto mx-auto font-sans px-2">
          <Container className="border border-solid border-[#e2e8f0] rounded-[32px] my-[40px] mx-auto p-[20px] max-w-[465px] bg-white shadow-xl shadow-slate-200/50">
            
            {/* Header Branding */}
            <Section className="mt-[32px] text-center">
              <Img
                 src="https://amesteticadental.com/icons/icon-192x192.png"
                 width="60"
                 height="60"
                 alt="AM Clínica"
                 className="my-0 mx-auto rounded-2xl shadow-lg border border-slate-100"
              />
              <Heading className="text-slate-900 text-[24px] font-black p-0 mt-[16px] mb-0 mx-0 tracking-tighter">
                AM CLÍNICA
              </Heading>
              <Text className="text-slate-500 text-[12px] font-bold uppercase tracking-[0.2em] mt-1">
                ODONTOLOGÍA DE VANGUARDIA
              </Text>
            </Section>

            {/* Welcome Content */}
            <Section className="mt-[48px] px-[20px]">
              <Text className="text-slate-900 text-[20px] font-extrabold leading-[24px]">
                Hola {patientName}, 👋
              </Text>
              <Text className="text-slate-500 text-[16px] leading-[26px]">
                Es un honor darte la bienvenida a nuestra familia. En **AM Clínica**, no solo cuidamos dientes; diseñamos experiencias que transforman la seguridad de nuestros pacientes.
              </Text>
              
              {/* Feature Box 1 */}
              <Section className="bg-slate-50 rounded-2xl p-6 mt-6 border border-slate-100">
                 <Text className="text-brand font-black text-[11px] uppercase tracking-widest mb-1">
                   Tu Próximo Nivel
                 </Text>
                 <Text className="text-slate-900 font-bold m-0 p-0 text-[16px]">
                   Portal de Pacientes Digital
                 </Text>
                 <Text className="text-slate-500 text-[14px] mt-2 mb-0">
                   Ya puedes gestionar tus citas, acceder a presupuestos interactivos y comunicarte con tu doctor de forma directa.
                 </Text>
              </Section>
            </Section>

            {/* CTA Button */}
            <Section className="text-center mt-[48px] mb-[32px]">
              <Button
                className="bg-brand rounded-2xl text-white text-[16px] font-bold no-underline text-center px-8 py-4 shadow-lg shadow-brand/20"
                href={appUrl}
              >
                Acceder a mi Portal
              </Button>
            </Section>

            <Hr className="border border-solid border-[#f1f5f9] my-[26px] mx-0 w-full" />

            {/* Footer */}
            <Section className="px-[20px] mb-[32px]">
               <Text className="text-slate-500 text-[12px] leading-[20px] text-center italic">
                Estamos ubicados en San Isidro, Buenos Aires. Comprometidos con la excelencia clínica y tecnológica.
               </Text>
               <div className="flex justify-center gap-4 mt-6">
                 <Link href="https://instagram.com/amesteticadental" className="text-slate-400 text-[11px] font-bold uppercase no-underline tracking-widest">Instagram</Link>
                 <Link href="https://amesteticadental.com" className="text-slate-400 text-[11px] font-bold uppercase no-underline tracking-widest ml-4">Web</Link>
               </div>
            </Section>

          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default PremiumWelcomeEmail;
