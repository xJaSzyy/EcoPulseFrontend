const API_BASE_URL = 'http://localhost:5212'

export async function calculateMaximumSingleDangerZone(payload) {
    const response = await fetch(API_BASE_URL + '/calculate/maximum-single-danger-zone', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    return await response.json();
}
