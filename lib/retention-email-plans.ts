export type RecallTemplatePlan = {
    primaryTemplate: string;
    secondaryTemplate?: string;
};

export function resolveRetentionRecallTemplates(appointmentType: string | null | undefined): RecallTemplatePlan {
    switch (appointmentType) {
        case 'limpieza':
        case 'limpieza_convencional':
            return {
                primaryTemplate: 'recall_cleaning',
                secondaryTemplate: 'upgrade_cleaning_laser',
            };
        case 'limpieza_laser':
            return {
                primaryTemplate: 'recall_cleaning',
            };
        case 'control_carilla_inmediato':
        case 'control_carilla_anual':
            return {
                primaryTemplate: 'recall_veneer_control',
                secondaryTemplate: 'cross_sell_cleaning_after_veneers',
            };
        case 'blanqueamiento':
            return {
                primaryTemplate: 'recall_whitening',
            };
        case 'control_ortodoncia':
            return {
                primaryTemplate: 'recall_orthodontic_control',
            };
        default:
            return {
                primaryTemplate: 'recall_6_months',
            };
    }
}
