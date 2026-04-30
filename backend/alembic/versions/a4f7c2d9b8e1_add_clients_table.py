"""Add clients table

Revision ID: a4f7c2d9b8e1
Revises: 52686d0cfb5b
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a4f7c2d9b8e1"
down_revision: Union[str, Sequence[str], None] = "52686d0cfb5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("person_name", sa.String(), nullable=True),
        sa.Column("company_name", sa.String(), nullable=True),
        sa.Column("pan", sa.String(), nullable=True),
        sa.Column("cin", sa.String(), nullable=True),
        sa.Column("gstin", sa.String(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("is_deleted", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clients_cin"), "clients", ["cin"], unique=False)
    op.create_index(op.f("ix_clients_created_at"), "clients", ["created_at"], unique=False)
    op.create_index(op.f("ix_clients_created_by"), "clients", ["created_by"], unique=False)
    op.create_index(op.f("ix_clients_display_name"), "clients", ["display_name"], unique=False)
    op.create_index(op.f("ix_clients_entity_type"), "clients", ["entity_type"], unique=False)
    op.create_index(op.f("ix_clients_gstin"), "clients", ["gstin"], unique=False)
    op.create_index(op.f("ix_clients_is_deleted"), "clients", ["is_deleted"], unique=False)
    op.create_index(op.f("ix_clients_pan"), "clients", ["pan"], unique=False)
    op.create_index(op.f("ix_clients_updated_by"), "clients", ["updated_by"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_clients_updated_by"), table_name="clients")
    op.drop_index(op.f("ix_clients_pan"), table_name="clients")
    op.drop_index(op.f("ix_clients_is_deleted"), table_name="clients")
    op.drop_index(op.f("ix_clients_gstin"), table_name="clients")
    op.drop_index(op.f("ix_clients_entity_type"), table_name="clients")
    op.drop_index(op.f("ix_clients_display_name"), table_name="clients")
    op.drop_index(op.f("ix_clients_created_by"), table_name="clients")
    op.drop_index(op.f("ix_clients_created_at"), table_name="clients")
    op.drop_index(op.f("ix_clients_cin"), table_name="clients")
    op.drop_table("clients")
