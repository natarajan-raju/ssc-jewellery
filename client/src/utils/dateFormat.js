const getOrdinalSuffix = (day) => {
    const tens = day % 100;
    if (tens >= 11 && tens <= 13) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
};

export const formatAdminDate = (value) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const day = date.getDate();
    const month = date.toLocaleString('en-IN', { month: 'short' });
    const year = date.getFullYear();
    return `${day}${getOrdinalSuffix(day)} ${month} ${year}`;
};

export const formatAdminDateTime = (value) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const datePart = formatAdminDate(date);
    const timePart = date.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit'
    });
    return `${datePart}, ${timePart}`;
};
