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

interface PremiumInvitationEmailProps {
  name: string;
  role?: string;
  inviteLink: string;
}

export const PremiumInvitationEmail = ({
  name = "Ariel",
  role = "Administrador Genérico",
  inviteLink = "https://amesteticadental.com",
}: PremiumInvitationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Invitación Exclusiva: Únete al Equipo de AM Clínica 🏥</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: "#0F172A",
                accent: "#6366F1",
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
            </Section>

            <Section className="mt-[48px] px-[20px]">
              <Text className="text-slate-900 text-[20px] font-extrabold leading-[24px]">
                Hola {name}, 👋
              </Text>
              <Text className="text-slate-500 text-[16px] leading-[26px]">
                Has sido seleccionado para integrarte a la gestión digital de **AM Clínica**. Estamos escalando nuestra operación tecnológica y tu rol es clave en este proceso.
              </Text>
              
              <Section className="bg-slate-900 rounded-[24px] p-6 mt-6 border border-slate-800 text-white shadow-lg">
                 <Text className="text-accent font-black text-[11px] uppercase tracking-widest mb-1">
                   Rol Designado
                 </Text>
                 <Text className="text-white font-bold m-0 p-0 text-[18px]">
                   {role}
                 </Text>
                 <Text className="text-slate-400 text-[14px] mt-2 mb-0">
                   Asegúrate de completar tu perfil y configurar tu contraseña segura para comenzar.
                 </Text>
              </Section>
            </Section>

            <Section className="text-center mt-[40px] mb-[32px]">
              <Button
                className="bg-[#0F172A] rounded-2xl text-white text-[16px] font-bold no-underline text-center px-8 py-4 shadow-lg shadow-slate-900/20"
                href={inviteLink}
              >
                Configurar mi Cuenta
              </Button>
            </Section>

            <Hr className="border border-solid border-[#f1f5f9] my-[26px] mx-0 w-full" />

            <Section className="px-[20px] mb-[32px]">
               <Text className="text-slate-500 text-[12px] leading-[20px] text-center italic">
                Este enlace de invitación es personal y expira en 48 horas por motivos de seguridad.
               </Text>
            </Section>

          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default PremiumInvitationEmail;
