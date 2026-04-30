// ============================================================
// ENUMS — Fonte única de verdade para status de leitos
// ============================================================
export var BedStatus;
(function (BedStatus) {
    BedStatus["Occupied"] = "Ocupado";
    BedStatus["Available"] = "Dispon\u00EDvel";
    BedStatus["Cleaning"] = "Higieniza\u00E7\u00E3o";
    BedStatus["Maintenance"] = "Manuten\u00E7\u00E3o";
    BedStatus["Blocked"] = "Interditado";
    BedStatus["Reserved"] = "Reservado";
    BedStatus["Inactive"] = "Inativo";
})(BedStatus || (BedStatus = {}));
// ============================================================
// DOMAIN LOGIC — Regras de negócio centralizadas
// Não pertence ao frontend. Use esta função no backend
// e exporte as flags prontas para a View.
// ============================================================
export function deriveBedFlags(bed) {
    return {
        isOccupied: bed.status === BedStatus.Occupied || !!bed.patientId,
        isCleaning: bed.status === BedStatus.Cleaning,
        isMaintenance: bed.status === BedStatus.Maintenance || bed.status === BedStatus.Blocked,
        isReserved: bed.status === BedStatus.Reserved,
        isFree: bed.status === BedStatus.Available,
        isInactive: bed.isInactive === true || bed.status === BedStatus.Inactive,
        isDischarged: bed.isDischarged === true,
        isIsolation: bed.isIsolation === true,
    };
}
//# sourceMappingURL=Censo.js.map