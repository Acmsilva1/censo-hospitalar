export const groupLeitosBySetor = (rawData) => {
    // O Tasy cospe uma lista "flat". Aqui nós criamos a hierarquia.
    return rawData.reduce((acc, curr) => {
        const { UNIDADE, SETOR, LEITO, STATUS_LEITO, NOME_PACIENTE } = curr;
        if (!acc[UNIDADE])
            acc[UNIDADE] = { nome: UNIDADE, setores: {} };
        if (!acc[UNIDADE].setores[SETOR])
            acc[UNIDADE].setores[SETOR] = [];
        acc[UNIDADE].setores[SETOR].push({
            id: LEITO,
            status: STATUS_LEITO, // Ex: 1-Ocupado, 2-Vago, 3-Higienização
            paciente: NOME_PACIENTE || null,
            alerta: STATUS_LEITO === 3 // Exemplo de lógica de alerta
        });
        return acc;
    }, {});
};
//# sourceMappingURL=dataparser.js.map