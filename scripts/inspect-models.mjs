// Usage: node scripts/inspect-models.mjs public/models/sofa-3seat.glb
// Prints bbox dimensions and material names so catalog metadata can be filled in.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { getBounds } from '@gltf-transform/functions'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
const b = getBounds(scene)
console.log('size:', { width: b.max[0] - b.min[0], height: b.max[1] - b.min[1], depth: b.max[2] - b.min[2] })
console.log('materials:', doc.getRoot().listMaterials().map((m) => m.getName()))
