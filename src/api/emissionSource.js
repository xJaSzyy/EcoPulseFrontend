const API_BASE_URL = 'http://localhost:5000'

export async function getEmissionSourceById(id) {
    const response = await fetch(API_BASE_URL + '/emissionSource/' + id, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    return await response.json();
}
