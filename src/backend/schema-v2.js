const { getSession, verifyConnection, closeDriver } = require('./neo4j');

/**
 * CanvasData 분리 구조 - Neo4j Schema V2
 * 
 * 구조:
 * - CanvasItem: 위치 정보만 (Board-specific)
 * - DomainObject: 도메인 정보 (재사용 가능)
 * - BoundedContext: 컨텍스트 그룹
 * - UMLCanvasItem: UML 위치 정보
 * - UMLClass: UML 클래스 정보
 */

const applySchemaV2 = async () => {
    const session = getSession();

    try {
        console.log('[Schema V2] Applying constraints and indexes...');

        // ===== Eventstorming 레이어 =====

        // CanvasItem (위치 정보)
        await session.run(`
            CREATE CONSTRAINT canvasitem_id_unique IF NOT EXISTS
            FOR (c:CanvasItem) REQUIRE c.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ CanvasItem constraint created');

        // DomainObject (도메인 정보)
        await session.run(`
            CREATE CONSTRAINT domainobject_id_unique IF NOT EXISTS
            FOR (d:DomainObject) REQUIRE d.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ DomainObject constraint created');

        // BoundedContext
        await session.run(`
            CREATE CONSTRAINT boundedcontext_id_unique IF NOT EXISTS
            FOR (bc:BoundedContext) REQUIRE bc.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ BoundedContext constraint created');

        // Board
        await session.run(`
            CREATE CONSTRAINT board_id_unique IF NOT EXISTS
            FOR (b:Board) REQUIRE b.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ Board constraint created');

        // ===== UML 레이어 =====

        // UMLCanvasItem
        await session.run(`
            CREATE CONSTRAINT umlcanvasitem_id_unique IF NOT EXISTS
            FOR (uc:UMLCanvasItem) REQUIRE uc.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ UMLCanvasItem constraint created');

        // UMLClass
        await session.run(`
            CREATE CONSTRAINT umlclass_id_unique IF NOT EXISTS
            FOR (cls:UMLClass) REQUIRE cls.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ UMLClass constraint created');

        // UMLAttribute
        await session.run(`
            CREATE CONSTRAINT umlattribute_id_unique IF NOT EXISTS
            FOR (attr:UMLAttribute) REQUIRE attr.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ UMLAttribute constraint created');

        // UMLMethod
        await session.run(`
            CREATE CONSTRAINT umlmethod_id_unique IF NOT EXISTS
            FOR (m:UMLMethod) REQUIRE m.id IS UNIQUE
        `);
        console.log('[Schema V2] ✓ UMLMethod constraint created');

        // ===== Indexes for Performance =====

        // Index on boardId for fast Canvas queries
        await session.run(`
            CREATE INDEX canvasitem_boardid IF NOT EXISTS
            FOR (c:CanvasItem) ON (c.boardId)
        `);
        console.log('[Schema V2] ✓ CanvasItem.boardId index created');

        // Index on type for DomainObject filtering
        await session.run(`
            CREATE INDEX domainobject_type IF NOT EXISTS
            FOR (d:DomainObject) ON (d.type)
        `);
        console.log('[Schema V2] ✓ DomainObject.type index created');

        // Index on instanceName for search
        await session.run(`
            CREATE INDEX domainobject_instancename IF NOT EXISTS
            FOR (d:DomainObject) ON (d.instanceName)
        `);
        console.log('[Schema V2] ✓ DomainObject.instanceName index created');

        // Index on BoundedContext name
        await session.run(`
            CREATE INDEX boundedcontext_name IF NOT EXISTS
            FOR (bc:BoundedContext) ON (bc.name)
        `);
        console.log('[Schema V2] ✓ BoundedContext.name index created');

        // UMLCanvasItem boardId index
        await session.run(`
            CREATE INDEX umlcanvasitem_boardid IF NOT EXISTS
            FOR (uc:UMLCanvasItem) ON (uc.boardId)
        `);
        console.log('[Schema V2] ✓ UMLCanvasItem.boardId index created');

        // UMLClass className index
        await session.run(`
            CREATE INDEX umlclass_classname IF NOT EXISTS
            FOR (cls:UMLClass) ON (cls.className)
        `);
        console.log('[Schema V2] ✓ UMLClass.className index created');

        console.log('[Schema V2] ✅ Schema V2 applied successfully!');

    } catch (error) {
        console.error('[Schema V2] ❌ Error applying schema:', error);
        throw error;
    } finally {
        await session.close();
    }
};

// Run if executed directly
if (require.main === module) {
    (async () => {
        const connected = await verifyConnection();
        if (!connected) {
            console.error('[Schema V2] Neo4j connection failed');
            process.exit(1);
        }
        await applySchemaV2();
        await closeDriver();
    })();
}

module.exports = { applySchemaV2 };
