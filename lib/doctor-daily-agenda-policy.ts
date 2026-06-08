export function shouldSendDailyDoctorAgenda(input: { appointmentCount: number }) {
    return input.appointmentCount > 0;
}
