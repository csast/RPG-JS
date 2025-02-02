import { xml2js } from 'xml-js'
import { TiledMap } from '../types/Map'
import { TilesetTile } from '../types/Tile'
import { TiledTileset } from '../types/Tileset'
import { Buffer } from 'buffer/'

export class TiledParser {
    private layers: Map<number, any> = new Map()

    constructor(private xml: string) {}

    static propToNumber = (obj, props: string[]) => {
      for (let key of props) {
        if (obj[key] !== undefined) {
          obj[key] = +obj[key]
        }        
      }
      return obj
    }

    static propToBool = (obj, props: string[]) => {
      for (let key of props) {
        if (obj[key] !== undefined) {
          obj[key] = obj[key] == 'true' || obj[key] == '1'
        }        
      }
      return obj
    }

    static toArray<T>(prop): T[] {
      if (!prop) return []
      if (!Array.isArray(prop)) return [prop]
      return prop
    }

    static transform = (obj) => {
      if (!obj) return
      const attr = obj.attributes || obj._attributes
      if (!attr) return obj
      let newObj = {
          ...obj,
          ...attr,
          ...TiledParser.propToNumber(attr, [
            'version',
            'width', 
            'height', 
            'tilewidth', 
            'tileheight', 
            'nextlayerid',
            'nextobjectid',
            'hexsidelength',
            'opacity',
            'x',
            'y',
            'offsetx',
            'offsety',
            'startx',
            'starty',
            'id',
            'firstgid',
            'imageheight',
            'imagewidth',
            'margin',
            'columns',
            'rows',
            'tilecount',
            'rotation',
            'gid',
            'tileid',
            'duration',
            'parallaxx',
            'parallaxy',
            'repeatx',
            'repeaty',
            'pixelsize'
          ]),
          ...TiledParser.propToBool(attr, [
            'visible',
            'infinite',
            'locked',
            'bold',
            'italic',
            'kerning',
            'strikeout',
            'underline',
            'wrap'
          ])
      }
      if (newObj.properties) {
        const properties: any = TiledParser.toArray(newObj.properties.property)
        const propObj = {}
        for (let prop of properties) {
          const attr = prop._attributes
          if (!attr) continue
          let val
          switch (attr.type) {
            case 'object':
            case 'float':
            case 'int':
                val = +attr.value
                break
            case 'bool':
                val = attr.value == 'true' ? true : false
                break
            case 'class':
                val =  {
                  ...(TiledParser.transform(prop)?.properties ?? {}),
                  _classname: attr.propertytype
                }
              break
            default:
                val = attr.value
          }
          propObj[attr.name] = val
        }
        newObj.properties = propObj
      }
      if (newObj.polygon) {
        newObj.polygon = TiledParser.transform(newObj.polygon)
      }
      if (newObj.polyline) {
        newObj.polyline = TiledParser.transform(newObj.polyline)
      }
      if (newObj.points) {
        newObj = newObj.points.split(' ').map(point => {
          const pos = point.split(',')
          return { x: +pos[0], y: +pos[1] }
        })
      }
      if (newObj.point) {
        newObj.point = true
      }
      if (newObj.ellipse) {
        newObj.ellipse = true
      }
      if (newObj.text) {
        newObj.text = {
          text: newObj.text._text,
          ...TiledParser.transform(newObj.text)
        }
        delete newObj.text._text
      }
      if (newObj.image) {
        newObj.image = TiledParser.transform(newObj.image)
      }
      const objectgroup = newObj.object || newObj.objectgroup?.object
      if (objectgroup) {
        newObj.objects = TiledParser.toArray(objectgroup).map((object: any) => {
          return TiledParser.transform(object)
        })
      }
      delete newObj._attributes
      delete newObj.attributes
      delete newObj.object
      delete newObj.objectgroup
      return newObj
    }

    static unpackTileBytes(buffer: Buffer, size: number): number[] | never {
      const expectedCount = size * 4
      if (buffer.length !== expectedCount) {
        throw new Error("Expected " + expectedCount +
        " bytes of tile data; received " + buffer.length)
      }
      let tileIndex = 0
      const array: number[] = []
      for (let i = 0; i < expectedCount; i += 4) {
          array[tileIndex] = buffer.readUInt32LE(i)
          tileIndex++
      }
      return array
    }

    static decode(obj: { encoding: string, data: string }, size: number) {
      const { encoding, data } = obj
      if (encoding == 'base64') {
         return TiledParser.unpackTileBytes(Buffer.from(data.trim(), 'base64'), size)
      }
      else if (encoding == 'csv') {
        return data.trim().split(',').map(x => +x)
      }
      return data
    }

    parseMap(): TiledMap {
        const json: any = xml2js(this.xml, { compact: true })
        const jsonNoCompact: any = xml2js(this.xml)
        //const layer = json.map.layer
        const tileset = json.map.tileset
        const group = json.map.group

        const recursiveObjectGroup = (obj) => {
          const { objectgroup, group, layer, imagelayer } = obj
          const setLayer = (type) => {
            if (!type) return
            TiledParser.toArray(type).forEach((val: any) => {
              this.layers.set(+val._attributes.id, val)
            })
          }
          setLayer(objectgroup)
          setLayer(layer)
          setLayer(group)
          setLayer(imagelayer)
          if (group) {
            recursiveObjectGroup(group)
          }
        }

        recursiveObjectGroup(json.map)

        const recursiveLayer = (elements, array: any = []) => {
          if (!elements) return array
          for (let element of elements) {
            const { name } = element
            if (!['layer', 'group', 'imagelayer', 'objectgroup'].includes(name)) continue
            const data = element.elements?.find(el => el.name == 'data')
            element.layer = this.layers.get(+element.attributes.id)
            const obj = {
              ...(TiledParser.transform(data) ?? {}),
              ...TiledParser.transform(element),
              ...TiledParser.transform(element.layer),
              layers: recursiveLayer(element.elements),
              data: data ? data.elements[0].text : undefined,
              type: name == 'layer' ? 'tilelayer' : name
            }
            delete obj.elements
            delete obj.layer
            if (obj.data) obj.data = TiledParser.decode(obj, obj.width * obj.height)
            array.push(obj)
          }
          return array
        }

        const layers = recursiveLayer(jsonNoCompact.elements[0].elements)

        const tilesets = TiledParser.toArray<TiledTileset>(tileset).map(tileset => {
          const obj = TiledParser.transform(tileset)
          return obj
        })

        const ret = {
          ...TiledParser.transform(json.map),
          layers,
          tilesets
        } 

        delete ret.layer
        delete ret.tileset
        delete ret.group
        delete ret.imagelayer

        return ret
    }

    parseTileset(): TiledTileset {
      const json: any = xml2js(this.xml, { compact: true })
      const { tileset } = json

      const ret = {
        ...TiledParser.transform(tileset),
        image: TiledParser.transform(tileset.image),
        tiles: TiledParser.toArray<TilesetTile>(tileset.tile).map((tile: any) => {
          const ret = TiledParser.transform(tile)
          if (tile.animation) {
            ret.animations = TiledParser.toArray(tile.animation.frame).map(TiledParser.transform)
          }
          delete ret.animation
          return ret
        })
      } 

      delete ret.tile

      return ret
    }
}