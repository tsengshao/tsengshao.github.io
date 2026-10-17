/* oxlint-disable typescript/no-explicit-any -- validated VTK JSON descriptors cross this boundary */
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData.js';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray.js';
import type { ScenePackage } from './scene-package';

const typedArrayConstructors: Record<string, any> = {
  Float64Array,
  Float32Array,
  Int32Array,
  Uint32Array,
  Int16Array,
  Uint16Array,
  Int8Array,
  Uint8Array,
};
async function hydrateValues(source: ScenePackage, descriptor: any) {
  const constructor = typedArrayConstructors[descriptor.dataType];
  if (!constructor) {
    throw Error(`不支援的數值型別 ${descriptor.dataType}`);
  }
  const raw = await source.asset(descriptor.asset);
  const expectedBytes = descriptor.size * constructor.BYTES_PER_ELEMENT;
  if (raw.byteLength !== expectedBytes) {
    throw Error('陣列大小不符');
  }
  return new constructor(raw.slice().buffer);
}

export async function hydrate(source: ScenePackage, descriptor: any) {
  const data: any = vtkPolyData.newInstance();
  try {
    for (const key of ['points', 'polys', 'lines', 'verts', 'strips']) {
      if (descriptor[key]) {
        const getter = 'get' + key[0].toUpperCase() + key.slice(1);
        data[getter]().setData(
          await hydrateValues(source, descriptor[key]),
          descriptor[key].numberOfComponents,
        );
      }
    }

    for (const association of ['pointData', 'cellData']) {
      const attributesDescriptor = descriptor[association];
      if (!attributesDescriptor) continue;
      const attributes =
        data[association === 'pointData' ? 'getPointData' : 'getCellData']();
      for (const { data: array } of attributesDescriptor.arrays) {
        attributes.addArray(
          vtkDataArray.newInstance({
            name: array.name,
            numberOfComponents: array.numberOfComponents,
            values: await hydrateValues(source, array),
          }),
        );
      }
      for (const role of [
        'Scalars',
        'Vectors',
        'Normals',
        'TCoords',
        'Tensors',
        'GlobalIds',
        'PedigreeIds',
      ]) {
        const activeIndex = attributesDescriptor['active' + role];
        if (activeIndex >= 0) {
          attributes['setActive' + role](
            attributesDescriptor.arrays[activeIndex].data.name,
          );
        }
      }
    }
    return data;
  } catch (e) {
    data.delete();
    throw e;
  }
}
