import {
  Body,
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

interface SurveyFirstVisitEmailProps {
  patientName: string;
  surveyToken: string;
}

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://am-clinica-main.vercel.app").replace(/\/$/, "");

export const SurveyFirstVisitEmail = ({
  patientName = "Paciente",
  surveyToken = "dummy-token",
}: SurveyFirstVisitEmailProps) => {
  const surveyBaseUrl = `${appUrl}/survey/${surveyToken}`;

  return (
    <Html>
      <Head />
      <Preview>¿Cómo fue tu primera visita a AM Clínica? ✨</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: "#4F46E5",
                accent: "#06B6D4",
                slate: {
                  900: "#0F172A",
                  800: "#1E293B",
                  500: "#64748B",
                  400: "#94A3B8",
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

            {/* Email Body Content */}
            <Section className="mt-[40px] px-[20px] text-center">
              <Text className="text-slate-900 text-[20px] font-extrabold leading-[24px] text-left">
                Hola {patientName}, 👋
              </Text>
              <Text className="text-slate-500 text-[15px] leading-[24px] text-left mt-2">
                Muchas gracias por confiar en nosotros y visitarnos hoy en **AM Clínica**.
              </Text>
              <Text className="text-slate-500 text-[15px] leading-[24px] text-left mt-2">
                Nos encantaría saber cómo fue tu experiencia y atención hoy en tu primera consulta. Tu respuesta nos ayuda a seguir brindando un servicio de excelencia y lleva menos de 30 segundos.
              </Text>
              
              <Text className="text-slate-900 font-extrabold text-[16px] mt-8 mb-4">
                ¿Cómo calificarías tu visita hoy?
              </Text>

              {/* Stars Container */}
              <Section className="my-6">
                <table align="center" border={0} cellPadding="0" cellSpacing="0" style={{ margin: "0 auto" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "0 6px" }}>
                        <Link href={`${surveyBaseUrl}?rating=1`} style={{ textDecoration: "none" }}>
                          <span style={{ fontSize: "36px", cursor: "pointer" }}>⭐</span>
                        </Link>
                      </td>
                      <td style={{ padding: "0 6px" }}>
                        <Link href={`${surveyBaseUrl}?rating=2`} style={{ textDecoration: "none" }}>
                          <span style={{ fontSize: "36px", cursor: "pointer" }}>⭐</span>
                        </Link>
                      </td>
                      <td style={{ padding: "0 6px" }}>
                        <Link href={`${surveyBaseUrl}?rating=3`} style={{ textDecoration: "none" }}>
                          <span style={{ fontSize: "36px", cursor: "pointer" }}>⭐</span>
                        </Link>
                      </td>
                      <td style={{ padding: "0 6px" }}>
                        <Link href={`${surveyBaseUrl}?rating=4`} style={{ textDecoration: "none" }}>
                          <span style={{ fontSize: "36px", cursor: "pointer" }}>⭐</span>
                        </Link>
                      </td>
                      <td style={{ padding: "0 6px" }}>
                        <Link href={`${surveyBaseUrl}?rating=5`} style={{ textDecoration: "none" }}>
                          <span style={{ fontSize: "36px", cursor: "pointer" }}>⭐</span>
                        </Link>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} style={{ height: "12px" }}></td>
                    </tr>
                    <tr>
                      <td colSpan={5} align="center">
                        <Text className="text-slate-400 text-[12px] m-0">
                          (Toca una estrella para calificar)
                        </Text>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              <Text className="text-slate-400 text-[13px] leading-[20px] text-center mt-6">
                Si algo no estuvo a la altura, tu opinión será revisada directamente por nuestro equipo médico de dirección.
              </Text>
            </Section>

            <Hr className="border border-solid border-[#f1f5f9] my-[26px] mx-0 w-full" />

            {/* Footer */}
            <Section className="px-[20px] mb-[32px]">
               <Text className="text-slate-500 text-[12px] leading-[20px] text-center italic">
                Estamos ubicados en Puerto Madero, Buenos Aires. Comprometidos con la excelencia clínica y tecnológica.
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

export default SurveyFirstVisitEmail;
