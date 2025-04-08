
const map = L.map('map', { preferCanvas: true }).setView([38.0, 27.0], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

const markerClusterGroup = L.markerClusterGroup();
map.addLayer(markerClusterGroup);

let markers = [];     
let selectedMarker = null; 
let polygon = null;        

function addMarker(lat, lng, name = 'New Marker', height = null, dbId = null) {
    const marker = L.marker([lat, lng], { draggable: true });

    function updatePopupContent() {
        marker.bindPopup(
            `<b>${name}</b><br>Height: ${height || 'N/A'}<br>
            Latitude: ${lat.toFixed(6)}<br>
            Longitude: ${lng.toFixed(6)}<br>
            <button class="editButton">Edit</button>
            <button class="deleteButton warning">Delete</button>`
        );
    }

    updatePopupContent();

    marker.on('popupopen', () => {
        const popup = marker.getPopup().getElement();
        const editButton = popup.querySelector('.editButton');
        editButton.addEventListener('click', () => {
            selectedMarker = marker;
            const markerData = markers.find(m => m.marker === marker);
            if (markerData) {
                document.getElementById('name').value = markerData.name;
                document.getElementById('lat').value = markerData.lat.toFixed(6);
                document.getElementById('lng').value = markerData.lng.toFixed(6);
                document.getElementById('height').value = markerData.height || '';
            }
        });

        const deleteButton = popup.querySelector('.deleteButton');
        deleteButton.addEventListener('click', async () => {
            const markerData = markers.find(m => m.marker === marker);
            if (markerData && markerData.dbId != null) {
                await deleteMarkerFromDatabase(markerData.dbId);
            }
            markerClusterGroup.removeLayer(marker);
            markers = markers.filter(m => m.marker !== marker);
            updateMarkerInfo();

            if (polygon) {
                const updatedCoords = markers.map(m => [m.lat, m.lng]);
                polygon.setLatLngs(updatedCoords);
            }
        });
    });

    marker.on('dragend', async () => {
        const newLatLng = marker.getLatLng();
        const markerIndex = markers.findIndex(m => m.marker === marker);
        if (markerIndex !== -1) {
            markers[markerIndex].lat = newLatLng.lat;
            markers[markerIndex].lng = newLatLng.lng;
            lat = newLatLng.lat;
            lng = newLatLng.lng;
            updatePopupContent();
            updateMarkerInfo();
            marker.openPopup();

            const updatedMarkerData = markers[markerIndex];
            if (updatedMarkerData.dbId != null) {
                await updateMarkerInDatabase(
                    updatedMarkerData.dbId,
                    updatedMarkerData.name,
                    updatedMarkerData.lat,
                    updatedMarkerData.lng,
                    updatedMarkerData.height
                );
            }

            if (polygon) {
                const updatedCoords = markers.map(m => [m.lat, m.lng]);
                polygon.setLatLngs(updatedCoords);
            }
        }
    });

    markerClusterGroup.addLayer(marker);

    markers.push({ dbId, lat, lng, name, height, marker });

    if (dbId == null) {
        saveMarkerToDatabase(name, lat, lng, height, marker);
    } else {
        updateMarkerInDatabase(dbId, name, lat, lng, height);
    }

    updateMarkerInfo();
}
document.getElementById('exportVisibleMarkers').addEventListener('click', async () => {
    try {
       
        const markerIdsOnScreen = markers
            .filter(m => m.dbId != null)  
            .map(m => m.dbId);          

        if (markerIdsOnScreen.length === 0) {
            alert("No markers on screen or no marker IDs found.");
            return;
        }

        const response = await fetch('/export-visible', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marker_ids: markerIdsOnScreen })
        });

        if (!response.ok) {
            throw new Error(`Failed to export. Server returned status ${response.status}`);
        }

        const geojsonData = await response.json();

        const dataStr = JSON.stringify(geojsonData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = "visible_points.geojson";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('Yalnızca ekranda olan markerların GeoJSON\'u indirildi.');
    } catch (error) {
        console.error('Export visible markers error:', error);
        alert('Error exporting visible markers');
    }
});
map.on('click', function (e) {
    const { lat, lng } = e.latlng;
    const name = `Marker ${markers.length + 1}`; // Varsayılan isim
    addMarker(lat, lng, name);
});
function updateMarkerInfo(filterText = '') {
    const infoContainer = document.getElementById('markerInfo');
    const filteredMarkers = markers.filter(m => m.name.toLowerCase().includes(filterText.toLowerCase()));

    infoContainer.innerHTML = filteredMarkers.map(m => {
        return `
        <div class="info-card">
            <button class="info-btn" onclick="zoomToMarker(${m.lat}, ${m.lng})">${m.name}</button>
            <p>Latitude: ${m.lat.toFixed(6)}</p>
            <p>Longitude: ${m.lng.toFixed(6)}</p>
            <p>Height: ${m.height || 'N/A'}</p>
        </div>`;
    }).join('');
}

window.zoomToMarker = function (lat, lng) {
    map.setView([lat, lng], 30);
};

document.getElementById('editMarker').addEventListener('click', async () => {
    if (!selectedMarker) {
        alert("Please select a marker to edit.");
        return;
    }

    const name = document.getElementById('name').value;
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);
    const height = parseFloat(document.getElementById('height').value);

    const markerData = markers.find(m => m.marker === selectedMarker);
    if (markerData && markerData.dbId != null) {
        await deleteMarkerFromDatabase(markerData.dbId);
    }

    markerClusterGroup.removeLayer(selectedMarker);

    markers = markers.filter(m => m.marker !== selectedMarker);

    addMarker(lat, lng, name, height);

    selectedMarker = null;

    if (polygon) {
        const updatedCoords = markers.map(m => [m.lat, m.lng]);
        polygon.setLatLngs(updatedCoords);
    }
});

document.getElementById('createPolygon').addEventListener('click', () => {
    if (markers.length < 3) {
        alert('You need at least 3 points to create a polygon.');
        return;
    }
    if (polygon) {
        map.removeLayer(polygon);
        polygon = null;
    }
    const coords = markers.map(m => [m.lat, m.lng]);
    polygon = L.polygon(coords).addTo(map).bindPopup('<b>Polygon Created</b>');
    polygon.openPopup();
});

document.getElementById('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const lat = parseFloat(document.getElementById('lat').value);
    const lng = parseFloat(document.getElementById('lng').value);
    const height = parseFloat(document.getElementById('height').value);
    addMarker(lat, lng, name, height);
    e.target.reset();
});

async function processCSVFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a file first.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const csvData = e.target.result.trim();
        const rows = csvData.split('\n');
        const delimiter = rows[0].includes(';') ? ';' : ','; 

        const header = rows[0].split(delimiter).map(h => h.trim().toLowerCase());

        const latIndex = header.indexOf(prompt("Enter the column name for Latitude:").toLowerCase());
        const lngIndex = header.indexOf(prompt("Enter the column name for Longitude:").toLowerCase());
        const nameIndex = header.indexOf(prompt("Enter the column name for Name:").toLowerCase());
        const heightIndex = header.indexOf(prompt("Enter the column name for Height (optional):").toLowerCase());

        if (latIndex === -1 || lngIndex === -1) {
            alert("Latitude and Longitude columns are required.");
            return;
        }

        const batchSize = 100; 
        for (let i = 1; i < rows.length; i += batchSize) { 
            const batch = rows.slice(i, i + batchSize);
            batch.forEach((row, index) => {
                const columns = row.split(delimiter).map(c => c.trim());

                let lat = parseFloat(columns[latIndex].replace(',', '.')); 
                let lng = parseFloat(columns[lngIndex].replace(',', '.')); 
                const name = nameIndex !== -1 ? columns[nameIndex] : 'Unnamed';
                const height = heightIndex !== -1 ? parseFloat(columns[heightIndex].replace(',', '.')) : null;

                if (!isNaN(lat) && !isNaN(lng)) {
                    addMarker(lat, lng, name, height);
                } else {
                    console.warn(`Invalid coordinates on row ${i + index + 1}:`, { lat, lng });
                }
            });

            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };

    reader.onerror = () => {
        alert("Error reading the file.");
        console.error("Error reading file.");
    };
    reader.readAsText(file);
}

document.getElementById('processFile').addEventListener('click', processCSVFile);


document.getElementById('clearAllMarkers').addEventListener('click', async () => {
    try {
        markerClusterGroup.clearLayers();
        markers = [];
        updateMarkerInfo();

        if (polygon) {
            map.removeLayer(polygon);
            polygon = null;
        }

        const response = await clearAllMarkersFromDatabase();
        alert(response.message || 'All markers have been removed from map and database!');
    } catch (error) {
        alert('An error occurred while clearing markers: ' + error.message);
    }
});

async function clearAllMarkersFromDatabase() {
    try {
        const response = await fetch('/points', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to delete markers');
        }

        console.log('All markers deleted from database:', data);
        return data;
    } catch (error) {
        console.error('Error deleting markers from database:', error);
        throw error;
    }
}

document.getElementById('searchMarkers').addEventListener('input', (e) => {
    const searchText = e.target.value;
    updateMarkerInfo(searchText);
});

document.getElementById('exportToJson').addEventListener('click', async () => {
    try {
        const response = await fetch('/export');
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        const geojsonData = await response.json();
        const dataStr = JSON.stringify(geojsonData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = "points.geojson";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log('Downloaded points.geojson');
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting JSON');
    }
});


async function saveMarkerToDatabase(name, lat, lng, height, marker) {
    try {
        const response = await fetch('/points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                latitude: lat,
                longitude: lng,
                height: height
            })
        });
        const data = await response.json();
        if (response.ok && data.point && data.point.id !== undefined) {
            const markerData = markers.find(m => m.marker === marker);
            if (markerData) {
                markerData.dbId = data.point.id;
            }
            console.log('Marker eklendi:', data);
        } else {
            console.error('Marker eklemede hata:', data);
        }
    } catch (error) {
        console.error('Sunucuya ekleme hatası:', error);
    }
}

async function updateMarkerInDatabase(dbId, name, lat, lng, height) {
    if (dbId == null) return; 
    try {
        const response = await fetch(`/points/${dbId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                latitude: lat,
                longitude: lng,
                height: height
            })
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Marker güncelleme başarısız:', data);
        } else {
            console.log('Marker güncellendi:', data);
        }
    } catch (error) {
        console.error('Sunucuya güncelleme hatası:', error);
    }
}

async function deleteMarkerFromDatabase(dbId) {
    if (dbId == null) return; 
    try {
        const response = await fetch(`/points/${dbId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('Marker silme başarısız:', data);
        } else {
            console.log('Marker silindi:', data);
        }
    } catch (error) {
        console.error('Sunucuya silme hatası:', error);
    }
}
