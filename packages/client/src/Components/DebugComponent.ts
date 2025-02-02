import { Utils } from "@rpgjs/common"
import { AbstractComponent, CellInfo } from "./AbstractComponent"
import { DebugComponentObject } from "@rpgjs/types"

export class DebugComponent extends AbstractComponent<DebugComponentObject, PIXI.Graphics> {
    static readonly id: string = 'debug'
    color: string = '#ff0000'
    cacheParams: string[] = ['map', 'position.x', 'position.y']
    private container: PIXI.Graphics = new PIXI.Graphics()

    onInit(cell: CellInfo) {
        this.addChild(this.container)
        this.updateRender(this.component.logic)
        this.interactive = true
        this.on('pointerdown', () => {
            console.log(this.component.logic)
        })
        super.onInit(cell)
    }

    updateRender(object: any) {
        const hitbox = object.hitbox
        const { pos, w, h } = hitbox
        this.container.clear()
        this.container.beginFill(Utils.hexaToNumber(this.color))
        this.container.drawRect(
            0,
            0,
            w,
            h
        );
        this.container.endFill()
    }
}