"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadOBJ = loadOBJ;
function parseOBJText(text) {
    const result = { positions: [], normals: [], uvs: [], faces: [] };
    const lines = text.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#'))
            continue;
        const parts = line.split(/\s+/);
        const type = parts[0];
        switch (type) {
            case 'v':
                result.positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
                break;
            case 'vn':
                result.normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
                break;
            case 'vt':
                result.uvs.push(parseFloat(parts[1]), parseFloat(parts[2]));
                break;
            case 'f': {
                const face = { v: [], vn: [], vt: [] };
                for (let i = 1; i < parts.length; i++) {
                    const indices = parts[i].split('/');
                    face.v.push(parseInt(indices[0]) - 1);
                    face.vt.push(indices[1] ? parseInt(indices[1]) - 1 : -1);
                    face.vn.push(indices[2] ? parseInt(indices[2]) - 1 : -1);
                }
                result.faces.push(face);
                break;
            }
        }
    }
    return result;
}
function triangulate(parsed) {
    const out = {
        positions: [],
        normals: [],
        uvs: [],
        indices: [],
    };
    const vertexMap = new Map();
    let nextIndex = 0;
    const getVertexKey = (vIdx, vtIdx, vnIdx) => `${vIdx}/${vtIdx}/${vnIdx}`;
    const addVertex = (vIdx, vtIdx, vnIdx) => {
        const key = getVertexKey(vIdx, vtIdx, vnIdx);
        if (vertexMap.has(key))
            return vertexMap.get(key);
        out.positions.push(parsed.positions[vIdx * 3], parsed.positions[vIdx * 3 + 1], parsed.positions[vIdx * 3 + 2]);
        if (vnIdx >= 0 && parsed.normals.length > 0) {
            out.normals.push(parsed.normals[vnIdx * 3], parsed.normals[vnIdx * 3 + 1], parsed.normals[vnIdx * 3 + 2]);
        }
        if (vtIdx >= 0 && parsed.uvs.length > 0) {
            out.uvs.push(parsed.uvs[vtIdx * 2], parsed.uvs[vtIdx * 2 + 1]);
        }
        const idx = nextIndex++;
        vertexMap.set(key, idx);
        return idx;
    };
    for (const face of parsed.faces) {
        for (let j = 1; j < face.v.length - 1; j++) {
            out.indices.push(addVertex(face.v[0], face.vt[0], face.vn[0]), addVertex(face.v[j], face.vt[j], face.vn[j]), addVertex(face.v[j + 1], face.vt[j + 1], face.vn[j + 1]));
        }
    }
    return out;
}
function loadOBJ(arrayBuffer, THREE) {
    let text;
    try {
        text = new TextDecoder('utf-8').decode(arrayBuffer);
    }
    catch (_) {
        const arr = new Uint8Array(arrayBuffer);
        let str = '';
        for (let i = 0; i < arr.length; i++)
            str += String.fromCharCode(arr[i]);
        text = str;
    }
    const parsed = parseOBJText(text);
    const tri = triangulate(parsed);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.positions, 3));
    if (tri.normals.length > 0) {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(tri.normals, 3));
    }
    else {
        geo.computeVertexNormals();
    }
    if (tri.uvs.length > 0) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(tri.uvs, 2));
    }
    geo.setIndex(tri.indices);
    const material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.5,
        metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = 'OBJ_Model';
    group.add(mesh);
    return group;
}
